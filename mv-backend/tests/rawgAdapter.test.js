import { describe, it, expect, vi, afterEach } from 'vitest';

const load = async () => {
    process.env.RAWG_API_KEY ||= 'test-key';
    return import('../src/adapters/media/rawg.ts');
};

const stub = (payload) => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));
    vi.stubGlobal('fetch', spy);
    return spy;
};

const game = (over = {}) => ({
    id: 326243,
    name: 'Elden Ring',
    name_original: 'Elden Ring',
    description_raw: 'The Golden Order has been broken.',
    released: '2022-02-25',
    tba: false,
    genres: [{ name: 'Action' }, { name: 'RPG' }],
    platforms: [{ platform: { name: 'PC' } }, { platform: { name: 'PlayStation 5' } }],
    developers: [{ name: 'FromSoftware' }],
    playtime: 62,
    background_image: 'https://media.rawg.io/x.jpg',
    ...over,
});

afterEach(() => vi.unstubAllGlobals());

// M4 is the checkpoint: RAWG shares nothing with TMDB, so these assert that
// the foreign shape really does collapse into the same MediaItem.
describe('RAWG normalises into the shared MediaItem shape', () => {
    it('maps name/released/background_image onto title/releaseYear/posterUrl', async () => {
        const { getGameDetails } = await load();
        stub(game());

        const item = await getGameDetails('326243');
        expect(item).toMatchObject({
            type: 'game',
            source: 'rawg',
            externalId: '326243',
            title: 'Elden Ring',
            releaseYear: 2022,
            posterUrl: 'https://media.rawg.io/x.jpg',
        });
        expect(item.genres).toEqual(['Action', 'RPG']);
    });

    it('carries every platform the game is on', async () => {
        const { getGameDetails } = await load();
        stub(game());
        expect((await getGameDetails('1')).platforms).toEqual(['PC', 'PlayStation 5']);
    });

    it('converts average playtime from hours to minutes', async () => {
        // runtime is minutes for a film; for a game it holds the expected time
        // investment in the same unit rather than earning its own column.
        const { getGameDetails } = await load();
        stub(game({ playtime: 62 }));
        expect((await getGameDetails('1')).runtime).toBe(3720);
    });

    it('leaves runtime null when RAWG has no playtime, never zero', async () => {
        const { getGameDetails } = await load();
        stub(game({ playtime: 0 }));
        expect((await getGameDetails('1')).runtime).toBeNull();
    });

    it('stringifies the id - RAWG 550 and TMDB 550 are different things', async () => {
        const { getGameDetails } = await load();
        stub(game({ id: 550 }));
        const item = await getGameDetails('550');
        expect(item.externalId).toBe('550');
        expect(typeof item.externalId).toBe('string');
    });

    it('handles an unreleased game rather than rejecting it', async () => {
        const { getGameDetails } = await load();
        stub(game({ released: null, tba: true }));
        const item = await getGameDetails('1');
        expect(item.releaseYear).toBeNull();
        expect(item.releaseStatus).toBe('TBA');
    });

    it('reports developers as creators, since games have no cast', async () => {
        const { getDetailsWithCast } = await load();
        stub(game());
        const item = await getDetailsWithCast('game', '1');
        expect(item.creators).toEqual(['FromSoftware']);
        expect(item.cast).toEqual([]);
    });

    it('survives a game with no platforms or genres', async () => {
        const { getGameDetails } = await load();
        stub(game({ platforms: undefined, genres: undefined }));
        const item = await getGameDetails('1');
        expect(item.platforms).toEqual([]);
        expect(item.genres).toEqual([]);
    });
});

describe('RAWG auth and errors', () => {
    it('sends the key as a query parameter, not a header', async () => {
        // Unlike TMDB's Bearer token. Keys in URLs leak into logs and
        // referrers, which is why this is proxied and never reaches a browser.
        const { searchGames } = await load();
        const spy = stub({ results: [] });

        await searchGames('elden ring');
        const url = String(spy.mock.calls[0][0]);
        expect(url).toContain('key=');
        expect(spy.mock.calls[0][1]?.headers?.Authorization).toBeUndefined();
    });

    it('refuses to call out with no key configured', async () => {
        const { getGameDetails } = await load();
        const saved = process.env.RAWG_API_KEY;
        delete process.env.RAWG_API_KEY;
        const spy = stub(game());

        await expect(getGameDetails('1')).rejects.toMatchObject({ statusCode: 503 });
        expect(spy).not.toHaveBeenCalled();

        process.env.RAWG_API_KEY = saved;
    });

    it('maps a 404 to a client error and a 500 to a 502', async () => {
        const { getGameDetails } = await load();

        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
        await expect(getGameDetails('nope')).rejects.toMatchObject({ statusCode: 404 });

        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
        await expect(getGameDetails('1')).rejects.toMatchObject({ statusCode: 502 });
    });

    it('names the key when RAWG rejects it, so the cause is obvious', async () => {
        const { getGameDetails } = await load();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
        await expect(getGameDetails('1')).rejects.toThrow(/API key/);
    });
});

describe('the adapter registry routes by source, not by guesswork', () => {
    it('sends a game row to RAWG and a film row to TMDB', async () => {
        const { adapterForSource, adapterForType } = await import('../src/adapters/media/index.ts');
        expect(adapterForSource('rawg').SOURCE).toBe('rawg');
        expect(adapterForSource('tmdb').SOURCE).toBe('tmdb');
        expect(adapterForType('game').SOURCE).toBe('rawg');
        expect(adapterForType('tv').SOURCE).toBe('tmdb');
    });

    it('returns null for an unknown source rather than defaulting to TMDB', async () => {
        // Defaulting would hand a Steam or IGDB row to the film adapter and
        // silently overwrite it with whatever TMDB returned for that id.
        const { adapterForSource, adapterForType } = await import('../src/adapters/media/index.ts');
        expect(adapterForSource('igdb')).toBeNull();
        expect(adapterForType('podcast')).toBeNull();
    });
});
