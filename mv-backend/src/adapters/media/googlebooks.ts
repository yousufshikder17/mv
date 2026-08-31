import 'dotenv/config';

// Google Books - book metadata ENRICHMENT only.
//
// Not the primary source, and not on any search path. Measured in M0: about
// 40% of calls return 503 backendFailed, which a daily batch can retry
// through and a search box cannot. Open Library answers the requests.
//
// But Google is better at two specific things, so it is worth one call at
// import time - a path that happens once per book ever and can afford to
// retry over a few seconds:
//
//   - Descriptions. Open Library work records are frequently empty.
//   - Categories. Open Library's subjects are library headings, so a real
//     record gave 'Labyrinths' and 'Curiosities and wonders' where Google
//     gave 'Fiction'.
//
// Best-effort throughout: if Google is down, the book still imports with
// whatever Open Library provided. Enrichment that can fail the import is
// worse than no enrichment.

const BASE = 'https://www.googleapis.com/books/v1/volumes';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Flattens the markdown and HTML publishers put in blurbs. */
export const stripMarkup = (text) => {
    if (!text) return null;
    const clean = String(text)
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    return clean || null;
};

/**
 * Looks a book up by title and author, returning only the fields worth
 * borrowing. Returns null on anything unexpected rather than throwing.
 */
export const enrichBook = async (title, authors = []) => {
    const key = process.env.GOOGLE_BOOKS_API_KEY;
    if (!key || !title) return null;

    const query = authors.length
        ? `intitle:${title} inauthor:${authors[0]}`
        : `intitle:${title}`;

    const url = new URL(BASE);
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '1');
    url.searchParams.set('country', 'US');
    url.searchParams.set('key', key);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
            if (res.ok) {
                const data = await res.json();
                const info = data?.items?.[0]?.volumeInfo;
                if (!info) return null;

                return {
                    // Google returns publisher blurbs containing markdown and
                    // occasionally HTML. Both render literally in the UI, so
                    // they are stripped here rather than in every consumer.
                    overview: stripMarkup(info.description),
                    // Google splits on slashes: 'Fiction / Fantasy / General'.
                    genres: (info.categories ?? [])
                        .flatMap((c) => String(c).split('/').map((x) => x.trim()))
                        .filter(Boolean),
                    pageCount: info.pageCount ?? null,
                    language: info.language ?? null,
                };
            }
            // 4xx will not fix itself; only retry the transient server errors.
            if (res.status < 500 && res.status !== 429) return null;
        } catch {
            // Network failure is the same as a 503 here: try again, then stop.
        }
        if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS * attempt);
    }

    return null;
};

/**
 * Fills gaps in an Open Library record without overwriting what it had.
 *
 * Open Library is the source of record; Google only supplies what is missing.
 * Genres are the exception - they are merged, because Open Library's library
 * headings and Google's categories describe genuinely different things and
 * both are useful.
 */
export const mergeBookMetadata = (base, extra) => {
    if (!extra) return base;

    const genres = [...(base.genres ?? [])];
    for (const g of extra.genres ?? []) {
        if (!genres.some((x) => x.toLowerCase() === g.toLowerCase())) genres.push(g);
    }

    return {
        ...base,
        overview: base.overview ?? extra.overview,
        pageCount: base.pageCount ?? extra.pageCount,
        // Open Library only reports language when unambiguous, so a value
        // from Google is strictly better than the null it left behind.
        language: base.language ?? extra.language,
        genres: genres.slice(0, 10),
    };
};
