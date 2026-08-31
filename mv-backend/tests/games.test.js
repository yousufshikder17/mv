import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';
import { clearCache } from '../src/utils/cache.js';
import { SEARCHABLE_TYPES } from '../src/adapters/media/index.ts';

beforeAll(createSchema);
beforeEach(async () => { await resetTables(); clearCache(); });
afterEach(() => vi.unstubAllGlobals());

// The import validator listed film and tv only, so every game import was
// rejected by validation before the controller saw it - a 400 that looked
// like a bad request rather than a missing case. This asserts the allowed
// types stay in step with the adapter registry.
describe('every searchable type can actually be imported', () => {
    it.each(SEARCHABLE_TYPES)('accepts type=%s at the validator', async (type) => {
        const user = await registerUser();
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200,
            json: async () => ({ id: 1, name: 'X', title: 'X', genres: [], platforms: [] }),
        })));

        const res = await user.auth(api().post('/movies/import')).send({ tmdbId: 1, type });

        // 400 would mean validation rejected the type outright.
        expect(res.status).not.toBe(400);
    });

    it('still rejects a type no adapter owns', async () => {
        // Deliberately not a real media type. 'book' and then 'album' were
        // each used here and each stopped testing anything the moment that
        // type shipped - the assertion passed for the wrong reason.
        const user = await registerUser();
        const res = await user.auth(api().post('/movies/import')).send({ tmdbId: 1, type: 'podcast' });
        expect(res.status).toBe(400);
    });
});

describe('games track like anything else', () => {
    it('stores platform, hours and a half-step rating', async () => {
        const user = await registerUser();
        const media = await createMovie({
            type: 'game', source: 'rawg', title: 'Elden Ring',
            platforms: ['PC', 'PlayStation 5'],
        });
        const added = await user.auth(api().post('/watchlist')).send({ movieId: media.id });
        const id = added.body.data.watchlistItem.id;

        const res = await user.auth(api().put(`/watchlist/${id}`))
            .send({ platform: 'PC', progressCurrent: 12, progressTotal: 62, rating: 9.5, status: 'IN_PROGRESS' });

        expect(res.body.data.watchlistItem).toMatchObject({
            platform: 'PC', progressCurrent: 12, progressTotal: 62, rating: 9.5, status: 'IN_PROGRESS',
        });
    });

    it('keeps the catalogue platforms separate from the user platform', async () => {
        // The game is on five platforms; this user plays it on one. Different
        // facts, and the catalogue row is shared between users.
        const user = await registerUser();
        const media = await createMovie({ type: 'game', source: 'rawg', platforms: ['PC', 'PlayStation 5'] });
        const added = await user.auth(api().post('/watchlist')).send({ movieId: media.id });
        await user.auth(api().put(`/watchlist/${added.body.data.watchlistItem.id}`)).send({ platform: 'PC' });

        const list = await user.auth(api().get('/watchlist'));
        const row = list.body.data.watchlist[0];
        expect(row.platform).toBe('PC');
        expect(row.movie.platforms).toEqual(['PC', 'PlayStation 5']);
    });

    it('lets the user platform be cleared', async () => {
        const user = await registerUser();
        const media = await createMovie({ type: 'game', source: 'rawg' });
        const added = await user.auth(api().post('/watchlist')).send({ movieId: media.id });
        const id = added.body.data.watchlistItem.id;
        await user.auth(api().put(`/watchlist/${id}`)).send({ platform: 'PC' });

        const res = await user.auth(api().put(`/watchlist/${id}`)).send({ platform: null });
        expect(res.body.data.watchlistItem.platform).toBeNull();
    });

    it('does not collide with a TMDB row sharing the same id', async () => {
        // RAWG 550 and TMDB 550 are unrelated. The catalogue key is
        // (source, type, externalId), so both must survive.
        await createMovie({ type: 'game', source: 'rawg', externalId: '550', title: 'A Game' });
        await createMovie({ type: 'film', source: 'tmdb', externalId: '550', title: 'Fight Club' });

        const user = await registerUser();
        const list = await user.auth(api().get('/movies'));
        expect(list.body.results).toBe(2);
    });
});
