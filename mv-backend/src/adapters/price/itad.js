import 'dotenv/config';

// IsThereAnyDeal - game prices across 30+ stores (SPEC 3, 7).
//
// Two rules from their terms shape this file, and both are compliance rather
// than politeness:
//
//   1. "You should not be constantly maxing out your usage, implement proper
//      caching." Caching is required, not an optimisation.
//   2. Rate limiting returns 429 with Retry-After, and attempting to work
//      around limits causes a ban. So a 429 is obeyed, never retried harder.
//
// And the rule that shapes everything downstream: ITAD SERVES history.
// historyLow carries the all-time, 1-year and 3-month low per game. SPEC 7 is
// explicit - "there is nothing to accumulate... query and cache theirs, do not
// mirror it" - and SPEC 12 puts any replacement for ITAD out of scope. Game
// price history is READ from them. Books are the opposite: nothing serves that,
// so we poll for it ourselves.

const BASE = 'https://api.isthereanydeal.com';

export const SOURCE = 'itad';

/** Set when a 429 tells us to wait. Nothing calls out again until it passes. */
let backoffUntil = 0;

export const rateLimitState = () => ({ backoffUntil });
export const resetRateLimit = () => { backoffUntil = 0; };

const keyOrThrow = () => {
    const key = process.env.ITAD_API_KEY;
    if (!key) {
        const err = new Error('ITAD_API_KEY is not set in mv-backend/.env');
        err.statusCode = 503;
        throw err;
    }
    return key;
};

const request = async (path, { params = {}, body = null, method = 'GET' } = {}) => {
    // A global pause, not a per-call retry. Their terms treat working around
    // a limit as ban-worthy, so the whole adapter stays quiet until the window
    // they named has passed.
    if (Date.now() < backoffUntil) {
        const err = new Error(`ITAD rate limited; waiting until ${new Date(backoffUntil).toISOString()}`);
        err.statusCode = 429;
        throw err;
    }

    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    url.searchParams.set('key', keyOrThrow());

    const res = await fetch(url, {
        method,
        signal: AbortSignal.timeout(20_000),
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });

    if (res.status === 429) {
        // Retry-After is seconds or an HTTP date. Default generously: guessing
        // low is how a rate limit becomes a ban.
        const header = res.headers.get('retry-after');
        const seconds = Number.parseInt(header ?? '', 10);
        const waitMs = Number.isFinite(seconds)
            ? seconds * 1000
            : header ? Math.max(0, new Date(header).getTime() - Date.now()) : 60_000;
        backoffUntil = Date.now() + (waitMs || 60_000);

        const err = new Error(`ITAD rate limited, backing off ${Math.round((waitMs || 60_000) / 1000)}s`);
        err.statusCode = 429;
        throw err;
    }

    if (!res.ok) {
        const err = new Error(
            res.status === 401 || res.status === 403
                ? 'ITAD rejected the API key'
                : `ITAD request failed (${res.status})`,
        );
        err.statusCode = res.status === 404 ? 404 : 502;
        throw err;
    }

    return res.json();
};

/**
 * Free-text game search.
 *
 * Lets the deal feed answer for titles nobody has tracked. Without it, search
 * only ever finds the seeded set - someone looking for Halo would be told
 * there are no deals, when what we actually mean is that we have never priced
 * it.
 *
 * `type: 'game'` filters out packages, bundles and art books, which otherwise
 * outrank the game itself for a plain title.
 */
export const searchGames = async (title, limit = 8) => {
    const results = await request('/games/search/v1', { params: { title, results: limit } });
    return (results ?? [])
        .filter((g) => g?.id && g.type === 'game')
        .map((g) => ({ id: g.id, title: g.title }));
};

/** Resolves a title to ITAD's own game id. Null when they do not have it. */
export const lookupGameId = async (title) => {
    const data = await request('/games/lookup/v1', { params: { title } });
    return data?.found ? data.game.id : null;
};

const toCents = (money) =>
    money && Number.isFinite(money.amountInt) ? money.amountInt : null;

/**
 * Current deals for one game, as PriceQuote rows.
 *
 * ITAD already reports amountInt in cents, which is the unit price_quote
 * stores - no float ever enters the pipeline.
 */
export const dealsToQuotes = (entry, mediaItemId, now = new Date()) => {
    const quoteDate = now.toISOString().slice(0, 10);

    return (entry?.deals ?? []).flatMap((deal) => {
        const priceCents = toCents(deal.price);
        if (priceCents === null) return [];

        const regularCents = toCents(deal.regular);
        // A "regular" price at or below the deal price is not a discount.
        const original = regularCents !== null && regularCents > priceCents ? regularCents : null;

        return [{
            mediaItemId,
            source: SOURCE,
            // Per shop, so one game on five stores is five quotes for the day
            // and the unique constraint keeps them apart.
            externalId: `${entry.id}:${deal.shop?.id ?? deal.shop?.name ?? 'unknown'}`,
            title: null,
            platform: deal.shop?.name ?? 'Unknown store',
            priceCents,
            currency: deal.price?.currency ?? 'USD',
            originalPriceCents: original,
            discountPercent: Number.isFinite(deal.cut) ? deal.cut : null,
            saleEnds: deal.expiry ? new Date(deal.expiry) : null,
            url: deal.url,
            fetchedAt: now,
            quoteDate,
        }];
    });
};

/**
 * Prices for up to `ids.length` games in ONE request.
 *
 * Batched deliberately: SPEC 7 requires polling to deduplicate by item rather
 * than by user, and this is where that pays - 500 watchers of one game is one
 * id in one call.
 */
export const fetchPrices = async (itadIds, { country = 'US' } = {}) => {
    if (!itadIds.length) return [];
    return request('/games/prices/v3', {
        method: 'POST',
        // deals=false means ALL current prices, not only discounted ones.
        //
        // It was 'true', and that was quietly wrong. ITAD returns NOTHING for
        // a game that is not on sale, so Hades at its normal $24.99 came back
        // as zero entries. Three consequences, none of them obvious:
        //
        //   1. Price history recorded only sale prices. A chart of what we
        //      observed could never show the normal price, which is the thing
        //      a sale is supposed to be compared against.
        //   2. A permanent price cut carrying no discount flag was invisible,
        //      so an alert on it would never fire.
        //   3. Searching a game at full price returned "no deals", when the
        //      truth was that we simply had no price for it.
        //
        // What counts as a deal is our judgement, made in dealService against
        // ITAD's historical lows - not a flag on their query string.
        params: { country, deals: 'false' },
        body: itadIds,
    });
};

/**
 * The historical lows ITAD serves: all-time, 1-year, 3-month.
 *
 * Read, never accumulated. Deal-quality scoring and "lowest in two years"
 * work on day one from their fields, which is why there is nothing here to
 * build a history table for.
 */
export const historyLowOf = (entry) => {
    const low = entry?.historyLow;
    if (!low) return null;
    return {
        allTimeCents: toCents(low.all),
        year1Cents: toCents(low.y1),
        month3Cents: toCents(low.m3),
        currency: low.all?.currency ?? 'USD',
    };
};
