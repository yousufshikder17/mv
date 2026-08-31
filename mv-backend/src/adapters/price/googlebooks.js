import 'dotenv/config';

// Google Books Volumes API -> PriceQuote[] (SPEC §7).
//
// Why this and not a Kindle deals feed: Amazon retired product RSS, eReaderIQ
// and BookBub block non-browser clients, and every reachable aggregator turned
// out to be a blog with no per-item price. This is first-party, documented,
// keyed, and free — and `googlebooks` is already scheduled for M6, so the
// adapter gets written once.
//
// There is NO deals endpoint. Prices are polled per volume and drops detected
// by comparing against the previous row, which is what SPEC §7 already
// prescribes: "polling deduplicates by item, not by user". It also means the
// history is genuinely accretive — Google serves today's price and nothing
// else, so a day not polled is a day gone.

const BASE = 'https://www.googleapis.com/books/v1/volumes';

export const SOURCE = 'google_books';
export const PLATFORM = 'Google Play Books';

// Measured 2026-08-31: roughly 40% of calls return 503 backendFailed, and it
// clears on retry. A daily batch can afford to wait; a request path cannot,
// which is why this adapter is poller-only.
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 2000;
// Their limit is per-IP and undocumented; one call every 1.2s is well inside
// anything they publish and costs a 20-volume sweep under half a minute.
const SPACING_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Prices arrive as floats. Store cents — a float price never survives years of aggregation. */
const toCents = (money) =>
    money && Number.isFinite(money.amount) ? Math.round(money.amount * 100) : null;

/**
 * Maps one volume resource to a PriceQuote, or null when it carries no price.
 * Exported for tests — this is the part worth pinning down.
 */
export const volumeToQuote = (volume, now = new Date()) => {
    const sale = volume?.saleInfo ?? {};
    const info = volume?.volumeInfo ?? {};

    // NOT_FOR_SALE is the majority of the catalogue. Skipping is correct: a
    // row with a null price is not a price observation.
    const priceCents = toCents(sale.retailPrice);
    if (!volume?.id || priceCents === null) return null;

    const listCents = toCents(sale.listPrice);
    // A list price at or below retail is not a discount, it is the same price
    // quoted twice — which is what Google returns for undiscounted volumes.
    const original = listCents !== null && listCents > priceCents ? listCents : null;

    return {
        source: SOURCE,
        externalId: volume.id,
        title: info.title ?? null,
        platform: PLATFORM,
        priceCents,
        currency: sale.retailPrice.currencyCode ?? 'USD',
        originalPriceCents: original,
        discountPercent: original
            ? Math.round(((original - priceCents) / original) * 100)
            : null,
        saleEnds: null, // Google publishes no end date for a promotion
        url: sale.buyLink ?? `https://books.google.com/books?id=${volume.id}`,
        fetchedAt: now,
        // The day the price was observed. Dedupe axis — a retried job on the
        // same day must not double-insert.
        quoteDate: now.toISOString().slice(0, 10),
    };
};

/** One volume, with backoff over Google's frequent 503s. */
const fetchVolume = async (id, key) => {
    const url = new URL(`${BASE}/${encodeURIComponent(id)}`);
    url.searchParams.set('country', 'US'); // required, or saleInfo comes back empty
    url.searchParams.set('key', key);

    let last = 'unknown';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (res.ok) return res.json();

        last = `HTTP ${res.status}`;
        // 4xx will not fix itself; only retry the transient server-side ones.
        if (res.status < 500 && res.status !== 429) break;
        await sleep(BACKOFF_MS * attempt);
    }
    throw new Error(last);
};

/**
 * Polls every configured volume.
 *
 * Returns { quotes, errors } rather than throwing: one dead volume must not
 * cost the day's other prices, which cannot be backfilled.
 */
export const fetchBookPrices = async (
    ids = process.env.GOOGLE_BOOKS_WATCH_IDS,
    key = process.env.GOOGLE_BOOKS_API_KEY,
    now = new Date(),
) => {
    const list = String(ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!key) throw new Error('GOOGLE_BOOKS_API_KEY is not set in mv-backend/.env');
    if (!list.length) throw new Error('GOOGLE_BOOKS_WATCH_IDS is not set in mv-backend/.env');

    const quotes = [];
    const errors = [];

    // Sequential, not Promise.all: their rate limit is per-IP, and twenty
    // simultaneous calls is how a polite poller becomes a blocked one.
    for (const [i, id] of list.entries()) {
        if (i > 0) await sleep(SPACING_MS);
        try {
            const quote = volumeToQuote(await fetchVolume(id, key), now);
            if (quote) quotes.push(quote);
        } catch (err) {
            errors.push(`${id}: ${err.message}`);
        }
    }

    return { quotes, errors };
};
