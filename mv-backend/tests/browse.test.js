import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { clearCache } from '../src/utils/cache.js';
import { api, createSchema, resetTables } from './helpers/testDb.js';
import * as registry from '../src/adapters/media/index.ts';

beforeAll(createSchema);
beforeEach(async () => {
    await resetTables();
    // Browse caches for an hour, which would otherwise leak one test's stub
    // into every test after it.
    clearCache();
});
afterEach(() => vi.restoreAllMocks());

describe('GET /movies/browse/:type', () => {
    it('serves a row for every browsable type, without an account', async () => {
        const spy = vi.spyOn(registry, 'browse').mockResolvedValue([
            { type: 'film', source: 'tmdb', externalId: '1', title: 'A film', releaseYear: 2026, posterUrl: null },
        ]);

        for (const type of registry.BROWSABLE_TYPES) {
            clearCache();
            const res = await api().get(`/movies/browse/${type}`);
            expect(res.status).toBe(200);
            expect(res.body.results).toBe(1);
        }

        expect(spy).toHaveBeenCalledTimes(registry.BROWSABLE_TYPES.length);
    });

    it('covers all five media types', async () => {
        // A nav link per type is the whole point; a type missing here is a
        // link to an error.
        expect(registry.BROWSABLE_TYPES).toEqual(['film', 'tv', 'game', 'book', 'album']);
    });

    it('rejects a type nobody serves, and says which exist', async () => {
        const res = await api().get('/movies/browse/podcast');
        expect(res.status).toBe(400);
        expect(res.body.supported).toContain('film');
    });

    it('returns an empty row rather than an error when the upstream fails', async () => {
        // A browse feed is the page's content, not the page. One dead API
        // must not turn a nav link into an error screen.
        vi.spyOn(registry, 'browse').mockRejectedValue(new Error('RAWG is down'));

        const res = await api().get('/movies/browse/game');
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    it('caches, so a type page does not hit the upstream per visit', async () => {
        // Every one of these feeds sits in front of somebody else's quota.
        const spy = vi.spyOn(registry, 'browse').mockResolvedValue([]);

        await api().get('/movies/browse/book');
        await api().get('/movies/browse/book');

        expect(spy).toHaveBeenCalledTimes(1);
    });
});
