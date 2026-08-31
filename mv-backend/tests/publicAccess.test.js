import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';
import { clearCache, cacheStats, cacheSize } from '../src/utils/cache.js';
import { SEARCHABLE_TYPES } from '../src/adapters/media/index.ts';

beforeAll(createSchema);
beforeEach(async () => { await resetTables(); clearCache(); vi.unstubAllGlobals(); });
afterEach(() => vi.unstubAllGlobals());

// Counts upstream calls so the cache can be proven, not assumed.
const stubTmdb = (payload = { results: [], id: 1, title: 'X', genres: [] }) => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));
    vi.stubGlobal('fetch', spy);
    return spy;
};

describe('the gate is persistence, not access', () => {
    it.each([
        ['/movies/search?q=dune'],
        ['/movies/trending'],
        ['/movies/details/film/438631'],
    ])('serves %s with no account', async (path) => {
        stubTmdb();
        const res = await api().get(path);
        expect(res.status).toBe(200);
    });

    it.each([
        ['get', '/movies'],
        ['get', '/movies/00000000-0000-0000-0000-000000000000'],
        ['post', '/movies/import'],
    ])('still requires an account to %s %s', async (method, path) => {
        const res = await api()[method](path);
        expect(res.status).toBe(401);
    });

    it('keeps the whole watchlist private', async () => {
        // The public routes must not have loosened anything that writes.
        for (const path of ['/watchlist']) {
            expect((await api().get(path)).status).toBe(401);
        }
    });
});

// The auth gate WAS the quota defence. movieRoutes.js said so outright.
// Removing it without these two protections trades a login wall for a
// revoked TMDB key.
describe('quota defence that replaced the auth gate', () => {
    it('serves a repeated search from cache without calling TMDB again', async () => {
        const spy = stubTmdb();

        await api().get('/movies/search?q=dune&type=film');
        await api().get('/movies/search?q=dune&type=film');
        await api().get('/movies/search?q=dune&type=film');

        expect(spy).toHaveBeenCalledTimes(1);
        expect(cacheStats.hits).toBe(2);
    });

    it('caches the untyped search too, which costs one call per source', async () => {
        // No type means searchAll across every searchable type - one upstream
        // call each for the first request, and none at all for the second.
        const spy = stubTmdb();
        await api().get('/movies/search?q=dune');
        await api().get('/movies/search?q=dune');
        expect(spy).toHaveBeenCalledTimes(SEARCHABLE_TYPES.length);
    });

    it('returns the sources that worked when one is down', async () => {
        // A RAWG outage must not cost the film and TV results. searchAll
        // settles rather than races, so a failing source contributes nothing
        // instead of failing the request.
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (String(url).includes('rawg.io')) throw new Error('ENOTFOUND');
            return { ok: true, status: 200, json: async () => ({ results: [{ id: 1, title: 'F', name: 'F' }] }) };
        }));

        const res = await api().get('/movies/search?q=dune');
        expect(res.status).toBe(200);
        expect(res.body.results).toBeGreaterThan(0);
    });

    it('treats a different query as a different key', async () => {
        const spy = stubTmdb();
        await api().get('/movies/search?q=dune&type=film');
        await api().get('/movies/search?q=arrival&type=film');
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('is case-insensitive, so DUNE does not cost a second call', async () => {
        const spy = stubTmdb();
        await api().get('/movies/search?q=Dune&type=film');
        await api().get('/movies/search?q=dUNE&type=film');
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('separates film and tv searches for the same term', async () => {
        const spy = stubTmdb();
        await api().get('/movies/search?q=severance&type=film');
        await api().get('/movies/search?q=severance&type=tv');
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('caches item details per type and id', async () => {
        const spy = stubTmdb();
        await api().get('/movies/details/film/550');
        await api().get('/movies/details/film/550');
        await api().get('/movies/details/tv/550');
        // film 550 and tv 550 are different titles - the cache must not
        // conflate them any more than the catalogue does.
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failure - a blip must not become an outage', async () => {
        // Typed, so the failure propagates: an untyped search settles across
        // sources and deliberately absorbs one being down.
        let calls = 0;
        vi.stubGlobal('fetch', vi.fn(async () => {
            calls += 1;
            if (calls === 1) return { ok: false, status: 500 };
            return { ok: true, status: 200, json: async () => ({ results: [] }) };
        }));

        const first = await api().get('/movies/search?q=dune&type=film');
        expect(first.status).toBe(502);

        // Serving the error back for the full TTL would turn a two-second
        // TMDB wobble into a five-minute one.
        const second = await api().get('/movies/search?q=dune&type=film');
        expect(second.status).toBe(200);
    });

    it('answers an empty query without touching TMDB at all', async () => {
        const spy = stubTmdb();
        const res = await api().get('/movies/search?q=');
        expect(res.status).toBe(200);
        expect(res.body.results).toBe(0);
        expect(spy).not.toHaveBeenCalled();
    });

    it('bounds the cache rather than growing with every distinct term', async () => {
        stubTmdb();
        for (let i = 0; i < 40; i++) await api().get(`/movies/search?q=term${i}&type=film`);
        expect(cacheSize()).toBeLessThanOrEqual(500);
    });
});

describe('the stricter public limiter is mounted, not merely defined', () => {
    it('advertises a lower limit on public routes than on authenticated ones', async () => {
        stubTmdb();
        const user = await registerUser();

        const pub = await api().get('/movies/trending');
        const authed = await user.auth(api().get('/movies'));

        // standardHeaders puts the ceiling in the response. An anonymous
        // caller in front of somebody else's quota gets the tighter one.
        expect(Number(pub.headers['ratelimit-limit']))
            .toBeLessThan(Number(authed.headers['ratelimit-limit']));
    });
});

// RAWG allows 20,000 requests a MONTH, about 650 a day, and an untyped public
// search costs one RAWG call per distinct query. The cache is the only thing
// standing between anonymous traffic and an exhausted month, so these assert
// it rather than trusting it.
describe('RAWG quota protection', () => {
    it('does not call RAWG again for a repeated untyped search', async () => {
        const spy = stubTmdb();
        await api().get('/movies/search?q=elden');
        await api().get('/movies/search?q=elden');
        await api().get('/movies/search?q=elden');

        const rawgCalls = spy.mock.calls.filter(([u]) => String(u).includes('rawg.io')).length;
        expect(rawgCalls).toBe(1);
    });

    it('never puts the RAWG key in a response', async () => {
        // It travels as a query parameter rather than a header, so it is one
        // careless passthrough away from a log or a referrer.
        stubTmdb();
        const res = await api().get('/movies/search?q=elden&type=game');
        expect(JSON.stringify(res.body)).not.toMatch(/key=/);
    });
});

describe('public details', () => {
    it('rejects a media type no adapter owns, instead of guessing', async () => {
        // Not a real media type, on purpose. This used 'book', then 'album',
        // and each time the type shipped the assertion started passing for
        // the wrong reason.
        stubTmdb();
        const res = await api().get('/movies/details/podcast/123');
        expect(res.status).toBe(400);
    });

    it('creates no catalogue row - browsing must not cache TMDB content', async () => {
        // Every row is content we then have to expire within six months
        // (SPEC 3). A visitor clicking around must not create that obligation.
        stubTmdb({ id: 550, title: 'Fight Club', genres: [], credits: { cast: [], crew: [] } });
        await api().get('/movies/details/film/550');

        const user = await registerUser();
        const list = await user.auth(api().get('/movies'));
        expect(list.body.results).toBe(0);
    });
});

describe('adding still needs an account', () => {
    it('401s an anonymous add so the client can prompt a login', async () => {
        const media = await createMovie();
        const res = await api().post('/watchlist').send({ movieId: media.id });
        expect(res.status).toBe(401);
    });
});
