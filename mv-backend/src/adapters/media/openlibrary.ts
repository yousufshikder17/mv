import 'dotenv/config';
import type { MediaItem, MediaSearchResult } from './types.ts';

// Open Library - book metadata.
//
// PRIMARY for books, with Google Books kept for prices only. That is not a
// preference, it follows from measurement: Google Books returned 503 on about
// 40% of calls when tested, which is fine for a daily batch that retries over
// minutes and unacceptable in front of someone typing in a search box. Open
// Library answered every time, has better ISBN coverage (93.6% vs 81.4%,
// SPEC 4), and needs no key.
//
// Their usage policy is the binding constraint and is explicit about what it
// does NOT want: 1 request/second unidentified, 3/second with a User-Agent
// naming the app and a contact; no bulk harvesting, no hundreds of single-book
// requests, and not to be used as a high-traffic backend. For bulk they offer
// monthly dumps instead.
//
// So this is on-demand only - a call happens when a person searches or adds a
// book, and the row is cached in our catalogue afterwards. It must never end
// up in the daily poller.

const BASE = 'https://openlibrary.org';
const COVERS = 'https://covers.openlibrary.org/b/id';

export const SOURCE = 'openlibrary';

// Naming the app and a contact is what earns 3/second instead of 1/second.
const USER_AGENT =
  process.env.OPENLIBRARY_USER_AGENT ?? 'MediaVault/0.1 (+https://github.com/yousufshikder17/mv)';

// Self-imposed spacing. Their limit is per-IP and they answer abuse with
// aggressive rate limiting or a block, so staying under it is cheaper than
// finding the ceiling.
const MIN_GAP_MS = 350;
let lastCall = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const request = async (path: string, params: Record<string, unknown> = {}) => {
    const wait = MIN_GAP_MS - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();

    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const res = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });

    if (!res.ok) {
        const err: any = new Error(
            res.status === 429
                ? 'Open Library rate limited us'
                : 'Open Library request failed (' + res.status + ')',
        );
        err.statusCode = res.status === 404 ? 404 : res.status === 429 ? 429 : 502;
        throw err;
    }

    return res.json();
};

export const coverUrl = (coverId?: number | null, size = 'M') =>
    coverId ? COVERS + '/' + coverId + '-' + size + '.jpg' : null;

// Work keys arrive as /works/OL123W. The bare id is the half worth storing.
const workId = (key?: string | null) => (key ? key.replace('/works/', '') : null);

const SEARCH_FIELDS = 'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,language';

/**
 * Search.
 *
 * `fields` is passed deliberately: without it Open Library returns a very
 * large document per result, and asking for less is the politest thing a
 * caller can do to an API that says outright it has limited resources.
 */
export const searchBooks = async (query: string): Promise<MediaSearchResult[]> => {
    const data = await request('/search.json', { q: query, limit: 20, fields: SEARCH_FIELDS });

    return (data.docs ?? [])
        .filter((d: any) => workId(d.key))
        .map((d: any) => ({
            type: 'book' as const,
            source: SOURCE,
            externalId: workId(d.key) as string,
            title: d.title,
            releaseYear: d.first_publish_year ?? null,
            posterUrl: coverUrl(d.cover_i, 'M'),
            // Search carries no description; the work call fills it in at
            // add-time, the same way TMDB search does.
            overview: null,
        }));
};

// Open Library returns description as either a string or { value }.
const descriptionOf = (work: any): string | null => {
    const d = work?.description;
    if (!d) return null;
    return typeof d === 'string' ? d : (d.value ?? null);
};

/**
 * One work, plus a search pass for the fields the work document lacks.
 *
 * Work documents carry description and subjects but not author names, page
 * count or year - those live on editions and in the search index. Two calls is
 * the honest cost of their data model, and it happens once per book ever, at
 * add-time.
 */
export const getBookDetails = async (externalId: string): Promise<MediaItem> => {
    const work = await request('/works/' + externalId + '.json');
    const found = await request('/search.json', {
        q: 'key:/works/' + externalId, limit: 1, fields: SEARCH_FIELDS,
    });
    const doc = (found.docs ?? [])[0];

    return {
        type: 'book',
        source: SOURCE,
        externalId,
        title: work.title ?? doc?.title,
        // Open Library has no separate original-title field; in their model
        // the work title IS the original.
        originalTitle: null,
        // Only when unambiguous. Open Library's `language` lists every
        // language the work has EDITIONS in, not the language it was written
        // in - taking [0] reported an English novel as Italian because an
        // Italian translation happened to sort first. A wrong language is
        // worse than none, especially for the non-English readers SPEC 4 is
        // about.
        language: doc?.language?.length === 1 ? doc.language[0] : null,
        overview: descriptionOf(work),
        releaseYear: doc?.first_publish_year ?? null,
        // Subjects are their genre equivalent, and there are often hundreds.
        genres: (work.subjects ?? []).slice(0, 8),
        runtime: null,
        // Median across editions. A hint for progressTotal, never a promise -
        // editions genuinely differ in length.
        pageCount: doc?.number_of_pages_median ?? null,
        posterUrl: coverUrl(work.covers?.[0] ?? doc?.cover_i, 'L'),
        seasonCount: null,
        episodeCount: null,
        releaseStatus: null,
    } as MediaItem;
};

/** Matches the other adapters so the controller stays source-agnostic. */
export const getDetails = (_type: string, externalId: string) => getBookDetails(externalId);

export const getDetailsWithCast = async (_type: string, externalId: string) => {
    const work = await request('/works/' + externalId + '.json');
    const item = await getBookDetails(externalId);

    // One call per author, capped at three. A book with forty contributors is
    // not worth forty requests to an API that asks callers not to make
    // hundreds of single-record calls.
    const authorKeys = (work.authors ?? [])
        .map((a: any) => a.author?.key)
        .filter(Boolean)
        .slice(0, 3);

    const creators: string[] = [];
    for (const key of authorKeys) {
        try {
            const author = await request(key + '.json');
            if (author?.name) creators.push(author.name);
        } catch { /* a missing author must not fail the page */ }
    }

    return { ...item, cast: [], creators };
};
