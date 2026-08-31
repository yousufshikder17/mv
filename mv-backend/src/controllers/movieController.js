import { eq, and, or, inArray, desc, lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { mediaItems, priceQuotes } from '../db/schema.js';
import * as tmdb from '../adapters/media/tmdb.ts';
import { adapterForSource, adapterForType, search as searchMedia } from '../adapters/media/index.ts';
import { cached } from '../utils/cache.js';
import * as itad from '../adapters/price/itad.js';
import { asc } from 'drizzle-orm';

// TMDB forbids caching their content beyond 6 months. We refresh well inside
// that window so a row is never served stale enough to breach it.
const CACHE_TTL_DAYS = 30;

// A returning series gains episodes between refreshes; a film does not. Thirty
// days is fine for TMDB compliance and useless to someone watching a show
// mid-season, who would be shown last month episode count.
const AIRING_TTL_DAYS = 3;
const AIRING_STATUSES = ['Returning Series', 'In Production', 'Planned'];

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const staleBefore = (item) =>
    item?.type === 'tv' && AIRING_STATUSES.includes(item.releaseStatus)
        ? daysAgo(AIRING_TTL_DAYS)
        : daysAgo(CACHE_TTL_DAYS);

/**
 * Re-pulls an item metadata from its source if the cached copy has aged out.
 * Falls back to the stale row if the source is unreachable - a slightly old
 * poster beats a broken list.
 *
 * Source-aware: only TMDB rows go to TMDB. Once RAWG exists, a game row must
 * never be handed to the film adapter.
 */
export const refreshIfStale = async (item) => {
    // Source-aware, not type-aware: a game row must go to RAWG even though the
    // TMDB adapter would happily accept the call and return nonsense.
    const adapter = adapterForSource(item?.source);
    if (!adapter || !item?.externalId) return item;
    if (item.refreshedAt && item.refreshedAt > staleBefore(item)) return item;

    try {
        const fresh = await adapter.getDetails(item.type, item.externalId);
        const [updated] = await db
            .update(mediaItems)
            .set({ ...fresh, refreshedAt: new Date() })
            .where(eq(mediaItems.id, item.id))
            .returning();
        return updated;
    } catch (err) {
        console.error(`${item.source} refresh failed for ${item.type}/${item.externalId}:`, err.message);
        return item;
    }
};

/**
 * GET /movies/search?q=&type= - proxies TMDB so the token stays server-side.
 * type is film | tv, or omitted for both interleaved.
 */
export const searchTmdb = async (req, res) => {
    const query = (req.query.q ?? '').trim();
    const { type } = req.query;

    if (!query) {
        return res.status(200).json({ status: 'Success', results: 0, data: [] });
    }

    // Thirty minutes, raised from five once games joined.
    //
    // RAWG allows 20,000 requests a MONTH - about 650 a day - and an untyped
    // public search costs one RAWG call per distinct query. Five minutes was
    // sized for TMDB, whose quota is generous; against RAWG it left the month
    // exhaustible by a few hundred searches a day from anyone at all.
    //
    // Half an hour is safe because search results for a term are stable: a new
    // release appears within the hour, and nothing else about the result set
    // moves. This is a compliance control, not an optimisation.
    const results = await cached(
        `search:${type ?? 'all'}:${query.toLowerCase()}`,
        30 * 60 * 1000,
        () => searchMedia(type, query),
    );

    return res.status(200).json({ status: 'Success', results: results.length, data: results });
};

/** GET /movies/trending - TMDB weekly trending, proxied. */
export const trending = async (req, res) => {
    // Trending is a weekly list. An hour is already far fresher than the data.
    const results = await cached('trending:film:week', 60 * 60 * 1000, () => tmdb.getTrending());
    return res.status(200).json({ status: 'Success', results: results.length, data: results });
};

/**
 * POST /movies/import { tmdbId, type }
 * Resolves a source id to a row in our shared catalogue, creating it on first
 * sight and refreshing it when stale. Returns the row so the client can then
 * track it by our own uuid.
 */
export const importFromTmdb = async (req, res) => {
    const { tmdbId, type = 'film' } = req.body;
    const externalId = String(tmdbId);
    const adapter = adapterForType(type);
    if (!adapter) return res.status(400).json({ error: 'Unknown media type' });

    const [existing] = await db
        .select()
        .from(mediaItems)
        .where(and(
            eq(mediaItems.source, adapter.SOURCE),
            eq(mediaItems.externalId, externalId),
            eq(mediaItems.type, type),
        ))
        .limit(1);

    if (existing) {
        const movie = await refreshIfStale(existing);
        return res.status(200).json({ status: 'Success', data: { movie } });
    }

    const details = await adapter.getDetails(type, externalId);

    // onConflictDoUpdate rather than plain insert: two users adding the same
    // title simultaneously would otherwise race into a unique violation.
    const [movie] = await db
        .insert(mediaItems)
        .values({ ...details, createdBy: req.user.id, refreshedAt: new Date() })
        .onConflictDoUpdate({
            // Must match the unique constraint exactly, or the conflict is
            // not detected and a film gets clobbered by a show sharing its id.
            target: [mediaItems.source, mediaItems.type, mediaItems.externalId],
            set: { ...details, refreshedAt: new Date() },
        })
        .returning();

    return res.status(201).json({ status: 'Success', data: { movie } });
};

/**
 * GET /movies/details/:type/:externalId - public item page data.
 *
 * Reads straight from TMDB and writes NOTHING to the catalogue. That is the
 * point: a visitor browsing must not create rows, or every idle click would
 * cache TMDB content we then have to expire within six months (SPEC 3) for a
 * title nobody tracks. A row is created only when someone actually adds it.
 */
export const publicDetails = async (req, res) => {
    const { type, externalId } = req.params;

    const adapter = adapterForType(type);
    if (!adapter) return res.status(400).json({ error: 'Unknown media type' });

    const item = await cached(
        `details:${type}:${externalId}`,
        60 * 60 * 1000,
        () => adapter.getDetailsWithCast(type, externalId),
    );

    // Our own row for this title, if it has ever been imported. Deliberately
    // NOT cached with the item above: the row appears the moment someone adds
    // it, and an hour of "not in the catalogue" would hide the alert control
    // from the person who just added it.
    const [row] = await db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(and(eq(mediaItems.source, adapter.SOURCE), eq(mediaItems.externalId, String(externalId))))
        .limit(1);

    return res.status(200).json({
        status: 'Success',
        data: { item: { ...item, mediaItemId: row?.id ?? null } },
    });
};

/**
 * GET /movies/prices/:type/:externalId - current deals and price history.
 *
 * Public, because game covers and data may appear publicly (RAWG's
 * redistribution clause is about reselling their dataset, not display) and a
 * price is ours either way.
 *
 * historyLow comes from ITAD, never from us. SPEC 7: they serve overall,
 * 1-year and 3-month lows, so "cheapest in two years" works on day one and
 * there is nothing to accumulate. Our own stored quotes are only what we have
 * observed since we started watching, and are used for the shape of the line
 * rather than for the claim about the low.
 */
export const itemPrices = async (req, res) => {
    const { type, externalId } = req.params;
    if (type !== 'game') {
        // Books have prices too, but through a different adapter (M0/M6).
        return res.status(200).json({ status: 'Success', data: { deals: [], historyLow: null, observed: [] } });
    }

    // Our catalogue row, if this game has ever been imported. Absent for a
    // title nobody tracks, which is fine - ITAD still answers.
    const [item] = await db
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.source, 'rawg'), eq(mediaItems.externalId, String(externalId))))
        .limit(1);

    const payload = await cached(`prices:game:${externalId}`, 30 * 60 * 1000, async () => {
        // An id we already resolved costs no lookup. One we have not needs the
        // title, which only exists once the game is in our catalogue.
        let itadId = item?.itadId ?? null;
        if (!itadId && item?.title) {
            itadId = await itad.lookupGameId(item.title);
            if (itadId) await db.update(mediaItems).set({ itadId }).where(eq(mediaItems.id, item.id));
        }
        if (!itadId) return { deals: [], historyLow: null };

        const [entry] = await itad.fetchPrices([itadId]);
        return {
            deals: itad.dealsToQuotes(entry, item?.id ?? null).map((q) => ({
                platform: q.platform,
                priceCents: q.priceCents,
                originalPriceCents: q.originalPriceCents,
                discountPercent: q.discountPercent,
                currency: q.currency,
                url: q.url,
            })).sort((a, b) => a.priceCents - b.priceCents),
            historyLow: itad.historyLowOf(entry),
        };
    });

    // What our own polling has seen. Not a claim about the all-time low -
    // that is ITAD's field - just the line we can honestly draw.
    const observed = item
        ? await db
            .select({ quoteDate: priceQuotes.quoteDate, priceCents: priceQuotes.priceCents })
            .from(priceQuotes)
            .where(eq(priceQuotes.mediaItemId, item.id))
            .orderBy(asc(priceQuotes.quoteDate))
            .limit(400)
        : [];

    // One point per day: the cheapest store that day is the price that
    // mattered.
    const byDay = new Map();
    for (const row of observed) {
        const prev = byDay.get(row.quoteDate);
        if (!prev || row.priceCents < prev) byDay.set(row.quoteDate, row.priceCents);
    }

    return res.status(200).json({
        status: 'Success',
        data: {
            ...payload,
            observed: [...byDay.entries()].map(([date, priceCents]) => ({ date, priceCents })),
        },
    });
};

/** GET /movies/:id/seasons/:n - episodes of one season. TV only. */
export const getSeasonEpisodes = async (req, res) => {
    const [item] = await db
        .select()
        .from(mediaItems)
        .where(eq(mediaItems.id, req.params.id))
        .limit(1);

    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.type !== 'tv') return res.status(400).json({ error: 'Not a TV show' });

    const episodes = await tmdb.getSeason(item.externalId, Number(req.params.n));
    return res.status(200).json({ status: 'Success', results: episodes.length, data: episodes });
};

/** GET /movies - the local catalogue, newest first. */
export const getAllMovies = async (req, res) => {
    const rows = await db
        .select()
        .from(mediaItems)
        .orderBy(desc(mediaItems.createdAt))
        .limit(100);

    return res.status(200).json({ status: 'Success', results: rows.length, data: rows });
};

/** GET /movies/:id - a single catalogue row by our uuid. */
export const getMovieById = async (req, res) => {
    const [movie] = await db
        .select()
        .from(mediaItems)
        .where(eq(mediaItems.id, req.params.id))
        .limit(1);

    if (!movie) {
        return res.status(404).json({ error: 'Movie not found' });
    }

    return res.status(200).json({ status: 'Success', data: { movie } });
};

/**
 * Sweeps every row past its TTL. Called from the daily poll job.
 *
 * Two windows, because rows go stale for different reasons: an airing show is
 * out of date in days, everything else has thirty days of compliance headroom.
 */
export const refreshStaleMovies = async () => {
    const stale = await db
        .select()
        .from(mediaItems)
        .where(or(
            lt(mediaItems.refreshedAt, daysAgo(CACHE_TTL_DAYS)),
            and(
                eq(mediaItems.type, 'tv'),
                inArray(mediaItems.releaseStatus, AIRING_STATUSES),
                lt(mediaItems.refreshedAt, daysAgo(AIRING_TTL_DAYS)),
            ),
        ));

    for (const item of stale) await refreshIfStale(item);
    return stale.length;
};
