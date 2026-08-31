import { describe, it, expect, vi, afterEach } from 'vitest';

// The whole point of M2: prove M1's abstraction holds for a second media type.
// TMDB is stubbed at fetch, so these assert our normalisation, not TMDB uptime.
const stub = (payload) => vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => payload,
})));

const load = async () => {
    process.env.TMDB_ACCESS_TOKEN ||= 'test-token';
    return import('../src/adapters/media/tmdb.ts');
};

afterEach(() => vi.unstubAllGlobals());

describe('field drift between films and TV', () => {
    // This is the entire difference between the two, and the reason a shared
    // MediaItem shape is worth having: normalise once, and nothing downstream
    // has to know which it got.
    it('reads name/first_air_date for TV where films use title/release_date', async () => {
        const { searchTv } = await load();
        stub({ results: [{ id: 95396, name: 'Severance', first_air_date: '2022-02-17', poster_path: '/p.jpg', overview: 'o' }] });

        const [hit] = await searchTv('severance');
        expect(hit).toMatchObject({ type: 'tv', source: 'tmdb', externalId: '95396', title: 'Severance', releaseYear: 2022 });
    });

    it('reads title/release_date for films', async () => {
        const { searchFilms } = await load();
        stub({ results: [{ id: 438631, title: 'Dune', release_date: '2021-09-15', poster_path: '/d.jpg', overview: 'o' }] });

        const [hit] = await searchFilms('dune');
        expect(hit).toMatchObject({ type: 'film', externalId: '438631', title: 'Dune', releaseYear: 2021 });
    });

    it('stringifies the external id — a numeric id is only unique within its source', async () => {
        const { searchTv } = await load();
        stub({ results: [{ id: 550, name: 'X', first_air_date: '2000-01-01' }] });
        const [hit] = await searchTv('x');
        // TMDB 550 and RAWG 550 are different things; the catalogue key is
        // (source, externalId), so the id must never be compared as a number.
        expect(hit.externalId).toBe('550');
        expect(typeof hit.externalId).toBe('string');
    });

    it('survives an undated title rather than rejecting it', async () => {
        const { searchTv } = await load();
        stub({ results: [{ id: 1, name: 'Announced', first_air_date: '' }] });
        const [hit] = await searchTv('a');
        expect(hit.releaseYear).toBeNull();
    });
});

describe('getTvDetails', () => {
    const show = {
        id: 95396, name: 'Severance', original_name: 'Severance', original_language: 'en',
        overview: 'o', first_air_date: '2022-02-17', genres: [{ name: 'Drama' }],
        episode_run_time: [59], poster_path: '/p.jpg',
        number_of_seasons: 3, number_of_episodes: 19, status: 'Returning Series',
    };

    it('carries season and episode counts', async () => {
        const { getTvDetails } = await load();
        stub(show);
        const item = await getTvDetails('95396');
        expect(item).toMatchObject({ type: 'tv', seasonCount: 3, episodeCount: 19, releaseStatus: 'Returning Series' });
    });

    it('takes episode_run_time as a hint and null when absent', async () => {
        const { getTvDetails } = await load();
        // Shows with variable episode lengths return an empty array. A missing
        // runtime must be null, never 0 or undefined.
        stub({ ...show, episode_run_time: [] });
        expect((await getTvDetails('1')).runtime).toBeNull();
    });

    it('populates originalTitle and language (SPEC §4)', async () => {
        const { getTvDetails } = await load();
        stub({ ...show, name: 'Attack on Titan', original_name: '進撃の巨人', original_language: 'ja' });
        const item = await getTvDetails('1');
        expect(item.originalTitle).toBe('進撃の巨人');
        expect(item.language).toBe('ja');
    });
});

describe('getSeason', () => {
    it('normalises episodes', async () => {
        const { getSeason } = await load();
        stub({ episodes: [
            { episode_number: 1, name: 'Good News About Hell', overview: 'o', air_date: '2022-02-17', runtime: 59 },
            { episode_number: 2, name: 'Half Loop', overview: '', air_date: null, runtime: null },
        ] });

        const eps = await getSeason('95396', 1);
        expect(eps).toHaveLength(2);
        expect(eps[0]).toMatchObject({ episodeNumber: 1, name: 'Good News About Hell', runtime: 59 });
        expect(eps[1].runtime).toBeNull();
        expect(eps[1].airDate).toBeNull();
    });
});

describe('getDetails routes by type', () => {
    it('sends tv to the tv endpoint and film to the movie endpoint', async () => {
        const { getDetails } = await load();
        const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 1, name: 'S', title: 'F', genres: [] }) }));
        vi.stubGlobal('fetch', spy);

        await getDetails('tv', '95396');
        expect(String(spy.mock.calls[0][0])).toContain('/tv/95396');

        await getDetails('film', '438631');
        expect(String(spy.mock.calls[1][0])).toContain('/movie/438631');
    });
});

describe('searchAll', () => {
    it('interleaves films and shows so neither type buries the other', async () => {
        const { searchAll } = await load();
        vi.stubGlobal('fetch', vi.fn(async (url) => ({
            ok: true, status: 200,
            json: async () => String(url).includes('/search/tv')
                ? { results: [{ id: 1, name: 'S1', first_air_date: '2020-01-01' }, { id: 2, name: 'S2', first_air_date: '2021-01-01' }] }
                : { results: [{ id: 3, title: 'F1', release_date: '2019-01-01' }] },
        })));

        const out = await searchAll('x');
        expect(out.map((r) => `${r.type}:${r.title}`)).toEqual(['film:F1', 'tv:S1', 'tv:S2']);
    });
});

describe('error mapping', () => {
    it('turns a TMDB 404 into a client error, not a 502', async () => {
        const { getTvDetails } = await load();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
        await expect(getTvDetails('nope')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('turns a TMDB 500 into a 502 — their outage is not the client fault', async () => {
        const { getTvDetails } = await load();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
        await expect(getTvDetails('1')).rejects.toMatchObject({ statusCode: 502 });
    });
});
