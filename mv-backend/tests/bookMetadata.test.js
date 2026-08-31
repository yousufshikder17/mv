import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanSubjects } from '../src/adapters/media/openlibrary.ts';
import { stripMarkup, mergeBookMetadata, enrichBook } from '../src/adapters/media/googlebooks.ts';

afterEach(() => vi.unstubAllGlobals());

// Open Library "subjects" are library headings, not genres, and they feed the
// recommender. Unfiltered, it could genuinely have said
// "Because you liked nyt:combined-print-and-e-book-fiction=2020-10-04".
describe('cleaning Open Library subjects', () => {
    it('drops key=value tags outright', () => {
        expect(cleanSubjects(['nyt:combined-print-and-e-book-fiction=2020-10-04'])).toEqual([]);
    });

    it('unwraps the namespaces that carry genre information', () => {
        expect(cleanSubjects(['genre:fantasy', 'form:novel'])).toEqual(['Fantasy', 'Novel']);
    });

    it('drops namespaces that describe something other than genre', () => {
        // place:, time: and person: are all real Open Library namespaces.
        expect(cleanSubjects(['place:london', 'time:1920s', 'person:napoleon'])).toEqual([]);
    });

    it('drops marketing noise', () => {
        expect(cleanSubjects(['New York Times bestseller', 'Booker Prize winner'])).toEqual([]);
    });

    it('keeps plain subject headings', () => {
        expect(cleanSubjects(['Fiction', 'English literature'])).toEqual(['Fiction', 'English literature']);
    });

    it('dedupes case-insensitively, since both forms arrive', () => {
        // A real record carried genre:fantasy AND Fantasy.
        expect(cleanSubjects(['genre:fantasy', 'Fantasy', 'FANTASY'])).toEqual(['Fantasy']);
    });

    it('survives an empty or missing list', () => {
        expect(cleanSubjects([])).toEqual([]);
        expect(cleanSubjects()).toEqual([]);
    });
});

describe('stripMarkup', () => {
    it('flattens the markdown and HTML publishers put in blurbs', () => {
        const raw = '**Bold** and *italic* with <i>tags</i><br>and a break.';
        expect(stripMarkup(raw)).toBe('Bold and italic with tags and a break.');
    });

    it('decodes the entities that would otherwise render literally', () => {
        expect(stripMarkup('Tom &amp; Jerry &quot;quoted&quot;')).toBe('Tom & Jerry "quoted"');
    });

    it('returns null rather than an empty string', () => {
        expect(stripMarkup('')).toBeNull();
        expect(stripMarkup(null)).toBeNull();
        expect(stripMarkup('   ')).toBeNull();
    });
});

// Open Library is the source of record. Google only fills what is missing -
// except genres, where the two describe genuinely different things.
describe('merging Google Books enrichment', () => {
    it('fills a missing description without touching one that exists', () => {
        const kept = mergeBookMetadata({ overview: 'Theirs.' }, { overview: 'Googles.' });
        expect(kept.overview).toBe('Theirs.');

        const filled = mergeBookMetadata({ overview: null }, { overview: 'Googles.' });
        expect(filled.overview).toBe('Googles.');
    });

    it('fills language, which Open Library reports only when unambiguous', () => {
        expect(mergeBookMetadata({ language: null }, { language: 'en' }).language).toBe('en');
    });

    it('merges genres rather than replacing them', () => {
        const merged = mergeBookMetadata(
            { genres: ['Labyrinths', 'Fiction'] },
            { genres: ['Fiction', 'Fantasy'] },
        );
        expect(merged.genres).toEqual(['Labyrinths', 'Fiction', 'Fantasy']);
    });

    it('returns the original untouched when Google gave nothing', () => {
        // The 40% case. An import must not depend on it.
        const base = { overview: null, genres: ['Fiction'], pageCount: 272 };
        expect(mergeBookMetadata(base, null)).toBe(base);
    });
});

describe('enrichBook is best-effort', () => {
    it('gives up quietly with no API key', async () => {
        const saved = process.env.GOOGLE_BOOKS_API_KEY;
        delete process.env.GOOGLE_BOOKS_API_KEY;
        const spy = vi.fn();
        vi.stubGlobal('fetch', spy);

        expect(await enrichBook('Piranesi')).toBeNull();
        expect(spy).not.toHaveBeenCalled();
        if (saved) process.env.GOOGLE_BOOKS_API_KEY = saved;
    });

    it('retries a 503 and then returns null rather than throwing', async () => {
        process.env.GOOGLE_BOOKS_API_KEY = 'test-key';
        const spy = vi.fn(async () => ({ ok: false, status: 503 }));
        vi.stubGlobal('fetch', spy);

        // Must not throw: a failed enrichment cannot be allowed to fail an
        // import.
        expect(await enrichBook('Piranesi')).toBeNull();
        expect(spy.mock.calls.length).toBeGreaterThan(1);
    }, 20000);

    it('does not retry a 400, which will not fix itself', async () => {
        process.env.GOOGLE_BOOKS_API_KEY = 'test-key';
        const spy = vi.fn(async () => ({ ok: false, status: 400 }));
        vi.stubGlobal('fetch', spy);

        expect(await enrichBook('Piranesi')).toBeNull();
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('splits the slash-separated categories Google returns', async () => {
        process.env.GOOGLE_BOOKS_API_KEY = 'test-key';
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200,
            json: async () => ({ items: [{ volumeInfo: {
                description: 'A novel.', categories: ['Fiction / Fantasy / General'], pageCount: 273,
            } }] }),
        })));

        const out = await enrichBook('Piranesi');
        expect(out.genres).toEqual(['Fiction', 'Fantasy', 'General']);
    });
});
