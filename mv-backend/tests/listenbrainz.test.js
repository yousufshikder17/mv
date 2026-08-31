import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { popularityFor, popularityScore, enrich, enrichmentStats } from '../src/adapters/enrichment/listenbrainz.js';
import { clearCache } from '../src/utils/cache.js';

const album = (externalId, over = {}) => ({
    type: 'album', source: 'musicbrainz', externalId,
    title: 'X', releaseYear: 2000, posterUrl: null, overview: null,
    ranking: { relevance: 100, releaseType: 'album', variants: [] },
    ...over,
});

const ok = (rows) => ({ ok: true, status: 200, json: async () => rows });

beforeEach(() => { clearCache(); enrichmentStats.calls = 0; enrichmentStats.failures = 0; });
afterEach(() => vi.unstubAllGlobals());

// Measured on the benchmark: enrichment took top-1 from 75% to 100%, and the
// signal is decisive - Michael Jackson's Thriller has 529,156 listens against
// 3,916 for the next candidate.
describe('popularity scoring', () => {
    it('is logarithmic, because counts span five orders of magnitude', () => {
        // Linear scaling would let one megahit flatten every other signal.
        expect(popularityScore(529156)).toBeGreaterThan(popularityScore(3916));
        expect(popularityScore(3916)).toBeGreaterThan(popularityScore(97));
        expect(popularityScore(529156) - popularityScore(3916)).toBeLessThan(40);
    });

    it('scores an unheard release zero rather than negative', () => {
        expect(popularityScore(0)).toBe(0);
        expect(popularityScore(undefined)).toBe(0);
    });

    it('caps at 100 so one enormous album cannot dominate the scale', () => {
        expect(popularityScore(999_999_999)).toBeLessThanOrEqual(100);
    });
});

// Search must work without enrichment. Last.fm was rejected partly for
// licensing; the same rule applies to whoever supplies popularity.
describe('failure never becomes search failure', () => {
    it.each([
        ['a timeout', () => { throw new Error('The operation was aborted'); }],
        ['a 500', () => ({ ok: false, status: 500 })],
        ['a 429', () => ({ ok: false, status: 429 })],
        ['malformed JSON', () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } })],
    ])('returns results unchanged on %s', async (_label, respond) => {
        vi.stubGlobal('fetch', vi.fn(async () => respond()));
        const input = [album('a'), album('b')];

        const out = await enrich(input);

        expect(out).toBe(input);
        expect(enrichmentStats.failures).toBe(1);
    });

    it('leaves a result untouched when it has no popularity data', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ok([])));
        const input = [album('unknown-mbid')];
        expect(await enrich(input)).toBe(input);
    });
});

describe('enrichment attaches popularity by MBID', () => {
    it('matches on the identifier, never on a title', async () => {
        // Same foundation as MusicBrainz, so there is no fuzzy artist+title
        // matching and no risk of attaching one album's listens to another.
        vi.stubGlobal('fetch', vi.fn(async () => ok([
            { release_group_mbid: 'mj', total_listen_count: 529156, total_user_count: 15577 },
        ])));

        const [enriched, untouched] = await enrich([album('mj'), album('other')]);

        expect(enriched.ranking.popularity).toBeGreaterThan(90);
        expect(untouched.ranking.popularity).toBeUndefined();
    });

    it('preserves the signals the adapter already set', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ok([
            { release_group_mbid: 'a', total_listen_count: 1000 },
        ])));

        const [out] = await enrich([album('a')]);
        expect(out.ranking.releaseType).toBe('album');
        expect(out.ranking.relevance).toBe(100);
    });

    it('sends ONE request for many candidates', async () => {
        // Batched, so enriching a hundred is not an N+1.
        const spy = vi.fn(async () => ok([]));
        vi.stubGlobal('fetch', spy);

        await popularityFor(Array.from({ length: 100 }, (_, i) => 'mbid-' + i));
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('never calls out for an empty candidate set', async () => {
        const spy = vi.fn();
        vi.stubGlobal('fetch', spy);

        expect((await popularityFor([])).size).toBe(0);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('caching', () => {
    it('serves a repeated lookup without calling out again', async () => {
        const spy = vi.fn(async () => ok([{ release_group_mbid: 'a', total_listen_count: 5 }]));
        vi.stubGlobal('fetch', spy);

        await popularityFor(['a', 'b']);
        await popularityFor(['a', 'b']);

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('is keyed on identifiers, not on the order they arrive in', async () => {
        const spy = vi.fn(async () => ok([]));
        vi.stubGlobal('fetch', spy);

        await popularityFor(['a', 'b']);
        await popularityFor(['b', 'a']);

        // The same set of albums is the same question.
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
