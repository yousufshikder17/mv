import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { mediaItems, priceQuotes, dealVotes } from '../db/schema.js';

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

    for (const row of best.values()) {
        const { quote, item, votes } = row;
        const discountPercent = quote.discountPercent ?? 0;
        if (discountPercent < minDiscount) continue;
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
