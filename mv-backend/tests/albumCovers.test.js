import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { clearCache } from '../src/utils/cache.js';

beforeEach(clearCache);
afterEach(() => vi.unstubAllGlobals());

const stub = (payload, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({
    ok, status: ok ? 200 : 503, json: async () => payload,
})));

const load = () => import('../src/adapters/enrichment/itunes.js');

describe('the artwork fallback', () => {
    it('upscales the thumbnail iTunes returns', async () => {
        // Search only ever returns 100x100; the same URL serves any size, and
        // a 100px image in a poster slot looks broken.
        const { albumCover } = await load();
        stub({ results: [{ artistName: 'Blood Incantation', artworkUrl100: 'https://is1.mzstatic.com/a/100x100bb.jpg' }] });

        expect(await albumCover('Blood Incantation', 'Absolute Elsewhere'))
            .toBe('https://is1.mzstatic.com/a/600x600bb.jpg');
    });

    it('refuses artwork from a different artist', async () => {
        // iTunes always returns its best guess, so an unrelated album comes
        // back looking like a hit. A wrong cover is worse than none.
        const { albumCover } = await load();
        stub({ results: [{ artistName: 'Taylor Swift', artworkUrl100: 'https://is1.mzstatic.com/x/100x100bb.jpg' }] });

        expect(await albumCover('Blood Incantation', 'Absolute Elsewhere')).toBeNull();
    });

    it('returns null rather than throwing when iTunes is down', async () => {
        // Artwork is decoration. A failure here costs a picture, never the row
        // it was going to sit in.
        const { albumCover } = await load();
        stub({}, false);

        expect(await albumCover('Some Band', 'Some Album')).toBeNull();
    });

    it('asks once for a repeated album, including when the answer was null', async () => {
        // An album with no cover on iTunes will not grow one by Thursday, so a
        // negative is worth caching exactly as long as a hit.
        const { albumCover } = await load();
        stub({ results: [] });

        await albumCover('Some Band', 'Some Album');
        await albumCover('Some Band', 'Some Album');

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('needs both an artist and a title before it will ask', async () => {
        const { albumCover } = await load();
        stub({ results: [] });

        expect(await albumCover(null, 'Album')).toBeNull();
        expect(await albumCover('Artist', null)).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('backfilling a row of albums', () => {
    const row = (over) => ({
        externalId: 'mbid-1', artist: 'Blood Incantation', name: 'Absolute Elsewhere',
        posterUrl: null, ...over,
    });

    it('leaves rows that already have art alone', async () => {
        const { backfillCovers } = await load();
        stub({ results: [{ artistName: 'x', artworkUrl100: 'https://is1/100x100bb.jpg' }] });

        const out = await backfillCovers([row({ posterUrl: 'https://caa/existing.jpg' })]);

        expect(out[0].posterUrl).toBe('https://caa/existing.jpg');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('keeps an album in the row even when no cover is found anywhere', async () => {
        // The point of the whole change: dropping coverless albums silently
        // reorders a popularity chart by who uploaded a scan, which is not
        // what the row claims to measure.
        const { backfillCovers } = await load();
        stub({ results: [] });

        const out = await backfillCovers([row({ externalId: 'a' }), row({ externalId: 'b' })]);

        expect(out).toHaveLength(2);
        expect(out.every((r) => r.posterUrl === null)).toBe(true);
    });

    it('caps how many lookups one row can trigger', async () => {
        // Apple asks for roughly 20 calls a minute, and a browse row must not
        // spend the budget of every other caller on decoration.
        const { backfillCovers } = await load();
        stub({ results: [] });

        const many = Array.from({ length: 20 }, (_, i) =>
            row({ externalId: `mbid-${i}`, name: `Album ${i}` }));
        const out = await backfillCovers(many);

        expect(out).toHaveLength(20);
        expect(fetch.mock.calls.length).toBeLessThanOrEqual(8);
    });
});
