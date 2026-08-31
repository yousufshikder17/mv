import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { mediaItems, priceQuotes, dealVotes } from '../db/schema.js';
import * as itad from '../adapters/price/itad.js';
import { cached } from '../utils/cache.js';


/**
 * The deal feed.
 *
 * Runs entirely on data the price poller already collects - no adapter, no
 * poller, no price logic added for it, which is M7's whole done-when. What it
 * adds is interpretation: which of today's prices are actually good.
 */

// A price older than this is not a deal, it is history.
const FRESH_DAYS = 3;

/**
 * How good a deal is, 0-100.
 *
 * Discount alone is a poor signal: a permanent 30% off something that is
 * always 30% off is not news. What makes a deal is the price relative to what
 * the item has ACTUALLY sold for - which is exactly what ITAD's historical
 * lows describe, and why SPEC 7 says to query their history rather than
 * accumulate our own.
 *
 * Falls back to raw discount when history is unknown, so a newly tracked item
 * still appears rather than scoring zero for lack of data.
 */
export const dealScore = (deal) => {
    const { priceCents, originalPriceCents, historyLowCents, historyLow1yCents } = deal;

    const discount = deal.discountPercent ?? (
        originalPriceCents && originalPriceCents > priceCents
            ? Math.round(((originalPriceCents - priceCents) / originalPriceCents) * 100)
            : 0
    );

    if (!historyLowCents) return Math.min(100, discount);

    // At or below the all-time low is the strongest thing that can be said
    // about a price, and rare enough to be worth saying loudly.
    if (priceCents <= historyLowCents) return 100;

    // Otherwise: how close to the floor, blended with the headline discount.
    const aboveLow = (priceCents - historyLowCents) / historyLowCents;
    const proximity = Math.max(0, 100 - aboveLow * 200);
    const yearBonus = historyLow1yCents && priceCents <= historyLow1yCents ? 15 : 0;

    return Math.round(Math.min(100, proximity * 0.6 + discount * 0.4 + yearBonus));
};

/** A reason, so a score is never an unexplained number. */
export const dealReason = (deal) => {
    if (deal.historyLowCents && deal.priceCents <= deal.historyLowCents) return 'Lowest price ever';
    if (deal.historyLow1yCents && deal.priceCents <= deal.historyLow1yCents) return 'Lowest in a year';
    if (deal.historyLow3mCents && deal.priceCents <= deal.historyLow3mCents) return 'Lowest in three months';
    if (deal.discountPercent > 0) return deal.discountPercent + '% off';
    return 'Currently available';
};

/**
 * Current deals, filtered and ranked.
 *
 * One row per item: something on sale at five stores is one deal at its
 * cheapest price, not five entries competing for the same slot in a feed.
 */
export const listDeals = async (opts = {}) => {
    const {
        q = null,
        type = null,
        minDiscount = 0,
        platform = null,
        maxPriceCents = null,
        expiringWithinHours = null,
        sort = 'score',
        limit = 60,
    } = opts;

    const since = new Date(Date.now() - FRESH_DAYS * 86400000).toISOString().slice(0, 10);

    const rows = await db
        .select({
            quote: priceQuotes,
            item: mediaItems,
            votes: sql`coalesce(sum(${dealVotes.value}), 0)`.mapWith(Number),
        })
        .from(priceQuotes)
        .innerJoin(mediaItems, eq(priceQuotes.mediaItemId, mediaItems.id))
        .leftJoin(dealVotes, eq(dealVotes.mediaItemId, mediaItems.id))
        .where(and(
            gte(priceQuotes.quoteDate, since),
            type ? eq(mediaItems.type, type) : undefined,
            platform ? eq(priceQuotes.platform, platform) : undefined,
        ))
        .groupBy(priceQuotes.id, mediaItems.id)
        .limit(1500);

    // Cheapest quote per item. A window function would push this into SQL but
    // needs dialect-specific syntax; the row cap keeps it cheap and readable.
    const best = new Map();
    for (const row of rows) {
        const current = best.get(row.item.id);
        if (!current || row.quote.priceCents < current.quote.priceCents) best.set(row.item.id, row);
    }

    const now = Date.now();
    const deals = [];

    // Matched in memory rather than in SQL. The candidate set is already
    // capped and deduplicated to one row per item by this point, so a LIKE in
    // the query would filter before the cheapest-store pass and could drop the
    // very row that survives it.
    const needle = q ? String(q).trim().toLowerCase() : null;

    for (const row of best.values()) {
        const { quote, item, votes } = row;
        if (needle && !item.title.toLowerCase().includes(needle)) continue;

        const discountPercent = quote.discountPercent ?? 0;
        if (discountPercent < minDiscount) continue;

        // Now that every current price is collected rather than only
        // discounted ones, the feed has to decide what a deal IS. A game at
        // its normal price with no cut is not one - unless it is sitting at or
        // near its historical low, which is a genuine deal even at 0% off.
        //
        // Skipped when a filter was given: someone who asked for a specific
        // title wants its price, deal or not.
        if (!needle && !minDiscount && discountPercent === 0) {
            const atLow = item.historyLowCents != null && quote.priceCents <= item.historyLowCents;
            if (!atLow) continue;
        }
        if (maxPriceCents != null && quote.priceCents > maxPriceCents) continue;

        const hoursLeft = quote.saleEnds
            ? (new Date(quote.saleEnds).getTime() - now) / 3600000
            : null;

        // Expiring-soon must exclude sales with no end date AND ones already
        // over - an expired deal in an "ending soon" list is worse than none.
        if (expiringWithinHours != null) {
            if (hoursLeft == null || hoursLeft > expiringWithinHours || hoursLeft < 0) continue;
        }

        const shape = {
            priceCents: quote.priceCents,
            originalPriceCents: quote.originalPriceCents,
            discountPercent,
            historyLowCents: item.historyLowCents,
            historyLow1yCents: item.historyLow1yCents,
            historyLow3mCents: item.historyLow3mCents,
        };

        deals.push({
            mediaItemId: item.id,
            title: item.title,
            type: item.type,
            source: item.source,
            posterUrl: item.posterUrl,
            platform: quote.platform,
            url: quote.url,
            currency: quote.currency,
            quoteDate: quote.quoteDate,
            saleEnds: quote.saleEnds,
            hoursLeft: hoursLeft != null ? Math.max(0, Math.round(hoursLeft)) : null,
            votes,
            ...shape,
            score: dealScore(shape),
            reason: dealReason(shape),
        });
    }

    const sorters = {
        // Community signal breaks ties on quality, never the reverse - a
        // popular mediocre deal should not outrank an all-time low.
        score: (a, b) => (b.score - a.score) || (b.votes - a.votes),
        newest: (a, b) => String(b.quoteDate).localeCompare(String(a.quoteDate)),
        discount: (a, b) => b.discountPercent - a.discountPercent,
        price: (a, b) => a.priceCents - b.priceCents,
        votes: (a, b) => (b.votes - a.votes) || (b.score - a.score),
    };

    return deals.sort(sorters[sort] ?? sorters.score).slice(0, limit);
};

/** The distinct stores currently represented, for the platform filter. */
export const dealPlatforms = async () => {
    const since = new Date(Date.now() - FRESH_DAYS * 86400000).toISOString().slice(0, 10);
    const rows = await db
        .selectDistinct({ platform: priceQuotes.platform })
        .from(priceQuotes)
        .where(gte(priceQuotes.quoteDate, since));
    return rows.map((r) => r.platform).filter(Boolean).sort();
};

// Apostrophes are removed rather than split on, so "Baldur's Gate 3" matches a
// search for "baldurs gate". Everything else non-alphanumeric becomes a space.
const normTitle = (s) =>
    String(s ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Is this result plausibly what was searched for?
 *
 * Purpose-built rather than reusing the music ranking scorer, which was the
 * first attempt and was wrong: that one penalises words the query did not ask
 * for, because in music an extra word usually means a cover or a tribute. In
 * games a subtitle is simply the title - "Halo Infinite" and "Stardew Valley"
 * are not noisy versions of "Halo" and "Stardew". It scored Baldur's Gate 3 at
 * -3 and filtered out everything.
 *
 * What matters here is only whether the query is actually in the title.
 */
export const titleMatches = (query, title) => {
    const q = normTitle(query);
    const t = normTitle(title);
    if (!q || !t) return false;

    // The whole query as a phrase, at a word boundary: "stardew" matches
    // "stardew valley", and "hades" does not match "furry SHADES of gay".
    //
    // Safe to build a regex from: normTitle has already reduced both sides to
    // lowercase letters, digits and spaces.
    if (new RegExp('(^| )' + q).test(t)) return true;

    // Otherwise most query words should begin a word in the title.
    //
    // Word-PREFIX, not substring. Plain substring matching accepted "hades 2"
    // for "Furry Shades of Gay 2" - because "hades" sits inside "shades" -
    // which is how a search for one game returned a completely different one
    // at 100% confidence.
    //
    // Prefix rather than equality so "witch" still finds "The Witcher 3".
    const titleWords = t.split(' ').filter(Boolean);
    const words = q.split(' ').filter((w) => w.length > 1);
    if (!words.length) return false;

    const hits = words.filter((w) => titleWords.some((tw) => tw.startsWith(w))).length;
    return hits / words.length >= 0.6;
};

/**
 * Live prices for a title nobody has tracked.
 *
 * Searching deals for "Halo" used to return nothing, which said "there are no
 * deals" when the truth was "we have never priced it". This asks ITAD
 * directly, so the feed can answer for the whole catalogue rather than only
 * the seeded set.
 *
 * Results are DISPLAYED, never stored. Storing them would grow the polled set
 * from anonymous searches, which is exactly the per-request cost creep SPEC 7
 * guards against - the poll set should grow with what people track, not with
 * what strangers type. If someone tracks the game, the normal flow stores it.
 *
 * Cached for thirty minutes: ITAD's terms require caching outright, and a
 * public search box is precisely where an uncached lookup would max out usage.
 */
export const liveDealsFor = async (query, { limit = 8 } = {}) => {
    const q = String(query ?? '').trim();
    if (q.length < 2) return [];

    try {
        return await cached('deals:live:' + q.toLowerCase(), 30 * 60 * 1000, async () => {
            const matches = await itad.searchGames(q, limit);
            if (!matches.length) return [];

            const byId = new Map(matches.map((m) => [m.id, m.title]));
            const entries = await itad.fetchPrices([...byId.keys()]);

            const out = [];
            for (const entry of entries ?? []) {
                const title = byId.get(entry.id);
                const best = (entry.deals ?? [])
                    .filter((d) => Number.isFinite(d?.price?.amountInt))
                    .sort((a, b) => a.price.amountInt - b.price.amountInt)[0];
                if (!title || !best) continue;

                const low = itad.historyLowOf(entry);
                const shape = {
                    priceCents: best.price.amountInt,
                    originalPriceCents: best.regular?.amountInt ?? null,
                    discountPercent: Number.isFinite(best.cut) ? best.cut : 0,
                    historyLowCents: low?.allTimeCents ?? null,
                    historyLow1yCents: low?.year1Cents ?? null,
                    historyLow3mCents: low?.month3Cents ?? null,
                };

                out.push({
                    // No catalogue row - this was never imported. The UI uses
                    // this to offer "track it" rather than "vote on it".
                    mediaItemId: null,
                    itadId: entry.id,
                    title,
                    type: 'game',
                    source: 'itad',
                    posterUrl: null,
                    platform: best.shop?.name ?? 'Unknown store',
                    url: best.url,
                    currency: best.price?.currency ?? 'USD',
                    quoteDate: new Date().toISOString().slice(0, 10),
                    saleEnds: best.expiry ? new Date(best.expiry) : null,
                    hoursLeft: null,
                    votes: 0,
                    live: true,
                    ...shape,
                    score: dealScore(shape),
                    reason: dealReason(shape),
                });
            }
            // Relevance first, deal quality second.
            //
            // ITAD's search is fuzzy: "hades 2" returned "Furry Shades of Gay
            // 2" scoring 100, because it genuinely IS at its all-time low - a
            // perfect deal on entirely the wrong game. Ranking by deal quality
            // alone surfaces whatever is cheapest among the mismatches.
            return out
                .filter((deal) => titleMatches(q, deal.title))
                .sort((a, b) => b.score - a.score);
        });
    } catch {
        // A live lookup that fails must not break the search - the local
        // results still stand.
        return [];
    }
};
