import { eq, desc, lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { movies as moviesTable } from '../db/schema.js';
import * as tmdb from '../services/tmdbService.js';

// TMDB forbids caching their content beyond 6 months. We refresh well inside
// that window so a row is never served stale enough to breach it.
const CACHE_TTL_DAYS = 30;

const staleBefore = () => new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

/**
 * Re-pulls a movie's metadata from TMDB if its cached copy has aged out.
 * Falls back to the stale row if TMDB is unreachable — a slightly old poster
 * beats a broken watchlist.
 */
export const refreshIfStale = async (movie) => {
    if (!movie?.tmdbId) return movie;
    if (movie.refreshedAt && movie.refreshedAt > staleBefore()) return movie;

    try {
        const fresh = await tmdb.getMovieDetails(movie.tmdbId);
        const [updated] = await db
            .update(moviesTable)
            .set({ ...fresh, refreshedAt: new Date() })
            .where(eq(moviesTable.id, movie.id))
            .returning();
        return updated;
    } catch (err) {
        console.error(`TMDB refresh failed for ${movie.tmdbId}:`, err.message);
        return movie;
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
        .from(moviesTable)
        .where(eq(moviesTable.tmdbId, tmdbId))
        .limit(1);

    if (existing) {
        const movie = await refreshIfStale(existing);
        return res.status(200).json({ status: 'Success', data: { movie } });
    }

    const details = await tmdb.getMovieDetails(tmdbId);

    // onConflictDoUpdate rather than plain insert: two users adding the same
    // film simultaneously would otherwise race into a unique violation.
    const [movie] = await db
        .insert(moviesTable)
        .values({ ...details, createdBy: req.user.id, refreshedAt: new Date() })
        .onConflictDoUpdate({
            target: moviesTable.tmdbId,
            set: { ...details, refreshedAt: new Date() },
        })
        .returning();

    return res.status(201).json({ status: 'Success', data: { movie } });
};

/** GET /movies — the local catalogue, newest first. */
export const getAllMovies = async (req, res) => {
    const rows = await db
        .select()
        .from(moviesTable)
        .orderBy(desc(moviesTable.createdAt))
        .limit(100);

    return res.status(200).json({ status: 'Success', results: rows.length, data: rows });
};

/** GET /movies/:id — a single catalogue row by our uuid. */
export const getMovieById = async (req, res) => {
    const [movie] = await db
        .select()
        .from(moviesTable)
        .where(eq(moviesTable.id, req.params.id))
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
        .from(moviesTable)
        .where(lt(moviesTable.refreshedAt, staleBefore()));

    for (const movie of stale) await refreshIfStale(movie);
    return stale.length;
};
