import { eq, and, or, inArray, desc, lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { mediaItems } from '../db/schema.js';
import * as tmdb from '../adapters/media/tmdb.ts';

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
    if (item?.source !== tmdb.SOURCE || !item?.externalId) return item;
    if (item.refreshedAt && item.refreshedAt > staleBefore(item)) return item;

    try {
        const fresh = await tmdb.getDetails(item.type, item.externalId);
        const [updated] = await db
            .update(mediaItems)
            .set({ ...fresh, refreshedAt: new Date() })
            .where(eq(mediaItems.id, item.id))
            .returning();
        return updated;
    } catch (err) {
        console.error(`TMDB refresh failed for ${item.type}/${item.externalId}:`, err.message);
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

    const search =
        type === 'tv' ? tmdb.searchTv : type === 'film' ? tmdb.searchFilms : tmdb.searchAll;
    const results = await search(query);

    return res.status(200).json({ status: 'Success', results: results.length, data: results });
};

/** GET /movies/trending - TMDB weekly trending, proxied. */
export const trending = async (req, res) => {
    const results = await tmdb.getTrending();
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

    const [existing] = await db
        .select()
        .from(mediaItems)
        .where(and(
            eq(mediaItems.source, tmdb.SOURCE),
            eq(mediaItems.externalId, externalId),
            eq(mediaItems.type, type),
        ))
        .limit(1);

    if (existing) {
        const movie = await refreshIfStale(existing);
        return res.status(200).json({ status: 'Success', data: { movie } });
    }

    const details = await tmdb.getDetails(type, externalId);

    // onConflictDoUpdate rather than plain insert: two users adding the same
    // title simultaneously would otherwise race into a unique violation.
    const [movie] = await db
        .insert(mediaItems)
        .values({ ...details, createdBy: req.user.id, refreshedAt: new Date() })
        .onConflictDoUpdate({
            target: [mediaItems.source, mediaItems.externalId],
            set: { ...details, refreshedAt: new Date() },
        })
        .returning();

    return res.status(201).json({ status: 'Success', data: { movie } });
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
