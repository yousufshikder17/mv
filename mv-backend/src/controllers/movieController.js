import { eq, and, desc, lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { mediaItems } from '../db/schema.js';
import * as tmdb from '../services/tmdbService.js';

// TMDB forbids caching their content beyond 6 months. We refresh well inside
// that window so a row is never served stale enough to breach it.
const CACHE_TTL_DAYS = 30;

const staleBefore = () => new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

/**
 * TMDB's shape -> our catalogue row. The identifier becomes (source,
 * externalId) because a numeric id is only unique within its own source —
 * TMDB 550 and RAWG 550 are different things (SPEC §5).
 *
 * Lives here for now; M2 moves it into adapters/media/tmdb.js when RAWG needs
 * the same treatment.
 */
const toMediaItem = ({ tmdbId, ...rest }) => ({
    ...rest,
    type: 'film',
    source: 'tmdb',
    externalId: String(tmdbId),
});

/**
 * Re-pulls a movie's metadata from TMDB if its cached copy has aged out.
 * Falls back to the stale row if TMDB is unreachable — a slightly old poster
 * beats a broken watchlist.
 */
export const refreshIfStale = async (item) => {
    if (item?.source !== 'tmdb' || !item?.externalId) return item;
    if (item.refreshedAt && item.refreshedAt > staleBefore()) return item;

    try {
        const fresh = toMediaItem(await tmdb.getMovieDetails(Number(item.externalId)));
        const [updated] = await db
            .update(mediaItems)
            .set({ ...fresh, refreshedAt: new Date() })
            .where(eq(mediaItems.id, item.id))
            .returning();
        return updated;
    } catch (err) {
        console.error(`TMDB refresh failed for ${item.externalId}:`, err.message);
        return item;
    }
};

/** GET /movies/search?q= — proxies TMDB search so the token stays server-side. */
export const searchTmdb = async (req, res) => {
    const query = (req.query.q ?? '').trim();

    if (!query) {
        return res.status(200).json({ status: 'Success', results: 0, data: [] });
    }

    const results = await tmdb.searchMovies(query);

    return res.status(200).json({
        status: 'Success',
        results: results.length,
        data: results,
    });
};

/**
 * POST /movies/import { tmdbId }
 * Resolves a TMDB id to a row in our shared catalogue, creating it on first
 * sight and refreshing it when stale. Returns the row so the client can then
 * add it to a watchlist by our own uuid.
 */
export const importFromTmdb = async (req, res) => {
    const { tmdbId } = req.body;

    const [existing] = await db
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.source, 'tmdb'), eq(mediaItems.externalId, String(tmdbId))))
        .limit(1);

    if (existing) {
        const movie = await refreshIfStale(existing);
        return res.status(200).json({ status: 'Success', data: { movie } });
    }

    const details = toMediaItem(await tmdb.getMovieDetails(tmdbId));

    // onConflictDoUpdate rather than plain insert: two users adding the same
    // film simultaneously would otherwise race into a unique violation.
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

/**
 * GET /movies/trending — TMDB's weekly trending list, proxied so the token
 * stays server-side. Nothing is cached into our catalogue here: a row is only
 * created when a user actually imports one, which keeps TMDB's 6-month expiry
 * bounded to titles somebody tracks.
 */
export const trending = async (req, res) => {
    const results = await tmdb.getTrending();
    return res.status(200).json({ status: 'Success', results: results.length, data: results });
};

/** GET /movies — the local catalogue, newest first. */
export const getAllMovies = async (req, res) => {
    const rows = await db
        .select()
        .from(mediaItems)
        .orderBy(desc(mediaItems.createdAt))
        .limit(100);

    return res.status(200).json({ status: 'Success', results: rows.length, data: rows });
};

/** GET /movies/:id — a single catalogue row by our uuid. */
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
 * Sweeps every row past the TTL. Not wired to a route — call it from a cron
 * job if this ever runs somewhere long-lived.
 */
export const refreshStaleMovies = async () => {
    const stale = await db
        .select()
        .from(mediaItems)
        .where(lt(mediaItems.refreshedAt, staleBefore()));

    for (const movie of stale) await refreshIfStale(movie);
    return stale.length;
};
