import { and, eq, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { mediaItems, trackingItems, priceAlerts } from '../db/schema.js';
import * as itad from '../adapters/price/itad.js';

/**
 * Polls game prices for every game anyone is watching.
 *
 * The one cost property that matters (SPEC 7): this deduplicates by ITEM, not
 * by user. If 500 people track Elden Ring it is one id in one batched request.
 * Request volume and price storage therefore go roughly flat past ~10k users,
 * and letting per-user polling creep in is the single failure this is written
 * to prevent.
 */

// ITAD accepts many ids per call. Batching is what makes per-item dedup pay -
// and their terms explicitly ask callers not to max out usage.
const BATCH_SIZE = 100;

const chunk = (arr, size) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

/**
 * Every game someone is tracking or has an alert on.
 *
 * DISTINCT on the item: a game watched by a hundred users is one row here.
 */
export const watchedGames = async () => {
    const tracked = db
        .select({ id: trackingItems.mediaItemId })
        .from(trackingItems)
        .where(isNotNull(trackingItems.mediaItemId));

    const alerted = db
        .select({ id: priceAlerts.mediaItemId })
        .from(priceAlerts)
        .where(eq(priceAlerts.active, true));

    return db
        .selectDistinct({ id: mediaItems.id, title: mediaItems.title, itadId: mediaItems.itadId })
        .from(mediaItems)
        .where(and(
            eq(mediaItems.type, 'game'),
            // Featured items are polled regardless of who tracks them, so the
            // public deal feed has something in it before anyone signs up.
            sql`(${mediaItems.featured} = true OR ${mediaItems.id} IN (${tracked}) OR ${mediaItems.id} IN (${alerted}))`,
        ));
};

/**
 * Resolves ITAD ids for games that do not have one yet, and remembers them.
 *
 * One lookup per game ever, rather than per poll. A game ITAD does not carry
 * is left null and simply skipped from then on - there is no point asking
 * again every morning.
 */
export const resolveItadIds = async (games) => {
    const resolved = [];
    for (const game of games) {
        if (game.itadId) { resolved.push(game); continue; }
        try {
            const itadId = await itad.lookupGameId(game.title);
            if (itadId) {
                await db.update(mediaItems).set({ itadId }).where(eq(mediaItems.id, game.id));
                resolved.push({ ...game, itadId });
            }
        } catch (err) {
            // A failed lookup is not a failed poll. Try again tomorrow.
            if (err.statusCode === 429) throw err;
        }
    }
    return resolved;
};

/**
 * Fetches current prices for every watched game.
 *
 * Returns quotes rather than writing them, so the caller owns storage and a
 * test can assert what would be stored without a database round trip.
 */
export const pollGamePrices = async ({ now = new Date() } = {}) => {
    const games = await watchedGames();
    if (!games.length) return { quotes: [], polled: 0, errors: [] };

    const withIds = await resolveItadIds(games);
    if (!withIds.length) return { quotes: [], polled: 0, errors: [] };

    const byItadId = new Map(withIds.map((g) => [g.itadId, g.id]));
    const quotes = [];
    const errors = [];

    for (const batch of chunk([...byItadId.keys()], BATCH_SIZE)) {
        try {
            const entries = await itad.fetchPrices(batch);
            for (const entry of entries ?? []) {
                const mediaItemId = byItadId.get(entry.id);
                if (!mediaItemId) continue;

                quotes.push(...itad.dealsToQuotes(entry, mediaItemId, now));

                // Cache ITAD's historical lows on the row.
                //
                // Deal scoring compares each price against its own history, so
                // fetching this per request would be one ITAD call per feed
                // row. Caching their answer is not rebuilding their dataset,
                // which SPEC 12 forbids - the numbers stay theirs and refresh
                // whenever we poll.
                const low = itad.historyLowOf(entry);
                if (low) {
                    await db.update(mediaItems).set({
                        historyLowCents: low.allTimeCents,
                        historyLow1yCents: low.year1Cents,
                        historyLow3mCents: low.month3Cents,
                    }).where(eq(mediaItems.id, mediaItemId));
                }
            }
        } catch (err) {
            errors.push(`itad: ${err.message}`);
            // A 429 pauses the whole adapter; continuing would be exactly the
            // "working around limits" their terms call ban-worthy.
            if (err.statusCode === 429) break;
        }
    }

    return { quotes, polled: byItadId.size, errors };
};
