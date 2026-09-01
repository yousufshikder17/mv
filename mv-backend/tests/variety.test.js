import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearCache } from '../src/utils/cache.js';
import { api, createSchema, resetTables, createMovie } from './helpers/testDb.js';

beforeAll(createSchema);
beforeEach(async () => {
    await resetTables();
    // The endpoint caches for ten minutes, which would otherwise serve the
    // first test's catalogue to every test after it.
    clearCache();
});

const seed = (type, n, over = {}) =>
    Promise.all(Array.from({ length: n }, (_, i) =>
        createMovie({ type, title: `${type} ${i}`, source: 'tmdb', ...over })));

describe('GET /movies/variety', () => {
    it('needs no account - it is a public discovery row', async () => {
        await seed('film', 2);
        expect((await api().get('/movies/variety')).status).toBe(200);
    });

    it('is empty rather than invented when the catalogue is empty', async () => {
        const res = await api().get('/movies/variety');
        expect(res.body.data).toEqual([]);
    });

    // The whole point of this row. An ordering that happens to return twelve
    // games is not variety, and "most recent" alone would do exactly that.
    it('does not let one busy type fill the strip', async () => {
        await seed('game', 40);
        await seed('film', 3);
        await seed('book', 3);

        const types = (await api().get('/movies/variety')).body.data.map((r) => r.type);

        expect(types.filter((t) => t === 'game').length).toBeLessThanOrEqual(6);
        expect(new Set(types)).toEqual(new Set(['game', 'film', 'book']));
    });

    it('still fills the strip when only one type exists', async () => {
        // Round-robin must not mean "refuse to show anything" on a young
        // catalogue that happens to hold films and nothing else.
        await seed('film', 20);

        const res = await api().get('/movies/variety');
        expect(res.body.results).toBe(12);
    });

    it('puts featured rows first', async () => {
        await seed('film', 5);
        await createMovie({ type: 'album', title: 'Picked', featured: true });

        const [first] = (await api().get('/movies/variety')).body.data;
        expect(first.title).toBe('Picked');
    });

    it('caps the strip at twelve', async () => {
        await seed('film', 10);
        await seed('tv', 10);
        await seed('game', 10);

        expect((await api().get('/movies/variety')).body.results).toBe(12);
    });
});
