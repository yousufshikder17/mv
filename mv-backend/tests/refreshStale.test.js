import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/config/db.js';
import { mediaItems } from '../src/db/schema.js';
import { createSchema, resetTables, createMovie } from './helpers/testDb.js';

// TMDB is mocked: these tests assert our cache-expiry logic, not TMDB's
// uptime, and a suite that needs a live API key is a suite that fails on CI.
vi.mock('../src/services/tmdbService.js', () => ({
    getMovieDetails: vi.fn(),
    searchMovies: vi.fn(),
    getTrending: vi.fn(),
    posterUrl: (p) => p,
}));

const tmdb = await import('../src/services/tmdbService.js');
const { refreshIfStale, refreshStaleMovies } = await import('../src/controllers/movieController.js');

const daysAgo = (n) => new Date(Date.now() - n * 864e5);

const fresh = (over = {}) => ({
    tmdbId: 438631,
    title: 'Dune',
    overview: 'Refreshed overview',
    releaseYear: 2021,
    genres: ['Science Fiction'],
    runtime: 155,
    posterUrl: '/poster.jpg',
    ...over,
});

beforeAll(createSchema);
beforeEach(async () => {
    await resetTables();
    vi.clearAllMocks();
});

// TMDB's terms forbid retaining cached content beyond 6 months. refreshedAt is
// what makes that enforceable, so these are compliance tests, not nice-to-haves.
describe('refreshIfStale', () => {
    it('re-fetches a row past the TTL and advances refreshedAt', async () => {
        tmdb.getMovieDetails.mockResolvedValue(fresh());
        const row = await createMovie({ tmdbId: 438631, title: 'STALE', refreshedAt: daysAgo(200) });

        const out = await refreshIfStale(row);

        expect(tmdb.getMovieDetails).toHaveBeenCalledWith(438631);
        expect(out.title).toBe('Dune');
        expect(out.runtime).toBe(155);
        expect(out.refreshedAt.getTime()).toBeGreaterThan(row.refreshedAt.getTime());
    });

    it('leaves a fresh row alone and never calls TMDB', async () => {
        const row = await createMovie({ refreshedAt: daysAgo(1) });

        const out = await refreshIfStale(row);

        expect(tmdb.getMovieDetails).not.toHaveBeenCalled();
        expect(out.refreshedAt.getTime()).toBe(row.refreshedAt.getTime());
    });

    it('returns the stale row when TMDB is unreachable, rather than throwing', async () => {
        // A slightly old poster beats a broken watchlist.
        tmdb.getMovieDetails.mockRejectedValue(new Error('TMDB request failed (502)'));
        const row = await createMovie({ title: 'STALE', refreshedAt: daysAgo(200) });

        const out = await refreshIfStale(row);

        expect(out.title).toBe('STALE');
    });

    it('ignores a row with no external id', async () => {
        const row = await createMovie({ tmdbId: null, refreshedAt: daysAgo(200) });
        await refreshIfStale(row);
        expect(tmdb.getMovieDetails).not.toHaveBeenCalled();
    });

    it('ignores a row from another source — TMDB must not refresh a RAWG row', async () => {
        // Only possible once the catalogue is keyed by (source, externalId).
        const row = await createMovie({ source: 'rawg', refreshedAt: daysAgo(200) });
        await refreshIfStale(row);
        expect(tmdb.getMovieDetails).not.toHaveBeenCalled();
    });
});

// Exported but called nowhere until the M0 cron wired it in. Untested code on
// a schedule against a live API is exactly what the roadmap warned about.
describe('refreshStaleMovies', () => {
    it('sweeps only the rows past the TTL', async () => {
        tmdb.getMovieDetails.mockImplementation(async (id) => fresh({ tmdbId: id, title: `Refreshed ${id}` }));

        const stale1 = await createMovie({ title: 'OLD 1', refreshedAt: daysAgo(120) });
        const stale2 = await createMovie({ title: 'OLD 2', refreshedAt: daysAgo(31) });
        const recent = await createMovie({ title: 'RECENT', refreshedAt: daysAgo(2) });

        const count = await refreshStaleMovies();

        expect(count).toBe(2);
        expect(tmdb.getMovieDetails).toHaveBeenCalledTimes(2);

        const [untouched] = await db.select().from(mediaItems).where(eq(mediaItems.id, recent.id));
        expect(untouched.title).toBe('RECENT');

        for (const id of [stale1.id, stale2.id]) {
            const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
            expect(row.title).toMatch(/^Refreshed /);
            expect(row.refreshedAt.getTime()).toBeGreaterThan(daysAgo(1).getTime());
        }
    });

    it('returns 0 and calls nothing when every row is fresh', async () => {
        await createMovie({ refreshedAt: daysAgo(1) });
        expect(await refreshStaleMovies()).toBe(0);
        expect(tmdb.getMovieDetails).not.toHaveBeenCalled();
    });

    it('keeps going when one row fails, so a single bad id cannot stall the sweep', async () => {
        const bad = await createMovie({ tmdbId: 111111, title: 'BAD', refreshedAt: daysAgo(200) });
        const good = await createMovie({ tmdbId: 222222, title: 'GOOD', refreshedAt: daysAgo(200) });

        tmdb.getMovieDetails.mockImplementation(async (id) => {
            if (id === 111111) throw new Error('TMDB request failed (404)');
            return fresh({ tmdbId: id, title: 'Refreshed' });
        });

        expect(await refreshStaleMovies()).toBe(2);

        const [b] = await db.select().from(mediaItems).where(eq(mediaItems.id, bad.id));
        const [g] = await db.select().from(mediaItems).where(eq(mediaItems.id, good.id));
        expect(b.title).toBe('BAD');        // untouched, not corrupted
        expect(g.title).toBe('Refreshed');  // the sweep carried on
    });
});
