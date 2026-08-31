import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchBooks, getBookDetails, coverUrl, SOURCE } from '../src/adapters/media/openlibrary.ts';

const stub = (payloads) => {
    let i = 0;
    const spy = vi.fn(async () => ({
        ok: true, status: 200,
        json: async () => payloads[Math.min(i++, payloads.length - 1)],
    }));
    vi.stubGlobal('fetch', spy);
    return spy;
};

const doc = (over = {}) => ({
    key: '/works/OL20893680W',
    title: 'Piranesi',
    author_name: ['Susanna Clarke'],
    first_publish_year: 2020,
    cover_i: 10226290,
    number_of_pages_median: 272,
    language: ['eng'],
    ...over,
});

const work = (over = {}) => ({
    title: 'Piranesi',
    description: 'A haunting novel.',
    subjects: ['Fantasy', 'Fiction', 'English literature'],
    covers: [10226290],
    ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('Open Library normalises into the shared shape', () => {
    it('strips the /works/ prefix so the id is the half worth storing', async () => {
        stub([{ docs: [doc()] }]);
        const [hit] = await searchBooks('piranesi');
        expect(hit).toMatchObject({ type: 'book', source: SOURCE, externalId: 'OL20893680W' });
    });

    it('skips a result with no work key rather than storing a broken row', async () => {
        stub([{ docs: [doc({ key: null }), doc()] }]);
        expect(await searchBooks('x')).toHaveLength(1);
    });

    it('asks for only the fields it uses', async () => {
        // Without `fields` Open Library returns a very large document per
        // result, and their policy says outright that resources are limited.
        const spy = stub([{ docs: [] }]);
        await searchBooks('piranesi');
        expect(String(spy.mock.calls[0][0])).toContain('fields=');
    });

    it('identifies itself, which is what earns 3 req/sec instead of 1', async () => {
        const spy = stub([{ docs: [] }]);
        await searchBooks('x');
        const ua = spy.mock.calls[0][1]?.headers?.['User-Agent'] ?? '';
        expect(ua).toMatch(/MediaVault/);
        expect(ua.length).toBeGreaterThan(10);
    });

    it('carries page count and description through to the detail', async () => {
        stub([work(), { docs: [doc()] }]);
        const item = await getBookDetails('OL20893680W');
        expect(item).toMatchObject({
            type: 'book', title: 'Piranesi', releaseYear: 2020, pageCount: 272,
        });
        expect(item.overview).toBe('A haunting novel.');
    });

    it('handles description given as an object rather than a string', async () => {
        // Open Library returns either shape depending on the record's age.
        stub([work({ description: { value: 'Object form.' } }), { docs: [doc()] }]);
        expect((await getBookDetails('X')).overview).toBe('Object form.');
    });

    it('survives a work with no description or subjects', async () => {
        stub([work({ description: undefined, subjects: undefined }), { docs: [doc()] }]);
        const item = await getBookDetails('X');
        expect(item.overview).toBeNull();
        expect(item.genres).toEqual([]);
    });

    it('caps subjects, since a work can carry hundreds', async () => {
        stub([work({ subjects: Array.from({ length: 50 }, (_, i) => 'S' + i) }), { docs: [doc()] }]);
        expect((await getBookDetails('X')).genres.length).toBeLessThanOrEqual(8);
    });
});

describe('language is only reported when unambiguous', () => {
    it('uses the language when there is exactly one', async () => {
        stub([work(), { docs: [doc({ language: ['eng'] })] }]);
        expect((await getBookDetails('X')).language).toBe('eng');
    });

    it('reports null when editions span several languages', async () => {
        // `language` lists every language the work has EDITIONS in, not the
        // one it was written in. Taking [0] reported an English novel as
        // Italian because a translation sorted first, and a wrong language is
        // worse than none for the readers SPEC 4 is about.
        stub([work(), { docs: [doc({ language: ['ita', 'spa', 'eng'] })] }]);
        expect((await getBookDetails('X')).language).toBeNull();
    });
});

describe('covers and errors', () => {
    it('builds a cover URL, and returns null without one', () => {
        expect(coverUrl(123, 'L')).toBe('https://covers.openlibrary.org/b/id/123-L.jpg');
        expect(coverUrl(null)).toBeNull();
    });

    it('maps 404 to a client error and 429 to a rate limit', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
        await expect(getBookDetails('nope')).rejects.toMatchObject({ statusCode: 404 });

        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
        await expect(getBookDetails('x')).rejects.toMatchObject({ statusCode: 429 });
    });
});
