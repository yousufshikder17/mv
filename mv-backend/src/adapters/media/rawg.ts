import 'dotenv/config';
import type { MediaItem, MediaSearchResult } from './types.ts';

// RAWG adapter - games.
//
// This is the first source that shares nothing with TMDB, which is the point:
// M4 exists to find out whether M1's shape holds against a genuinely foreign
// API while being wrong costs one media type instead of five.
//
// Three differences that matter:
//   1. The key is a ?key= QUERY PARAMETER, not a Bearer header. Keys in URLs
//      leak into server logs, referrer headers and browser history, so this is
//      proxied server-side and the key never reaches the client.
//   2. 20,000 requests/MONTH - about 650/day. Caching is not an optimisation
//      here; a naive fetch-per-view burns the month in a week.
//   3. Their terms require RAWG credited with an active hyperlink on EVERY
//      page displaying their data - stricter than TMDB's footer attribution.
//      "No data redistribution" means reselling the dataset, not showing a
//      cover, so game covers may appear publicly like TMDB posters.

const BASE = 'https://api.rawg.io/api';

export const SOURCE = 'rawg';
export const ATTRIBUTION_URL = 'https://rawg.io/';

const request = async (path: string, params: Record<string, unknown> = {}) => {
    const key = process.env.RAWG_API_KEY;
    if (!key) {
        const err = new Error('RAWG_API_KEY is not set in mv-backend/.env') as Error & { statusCode?: number };
        err.statusCode = 503;
        throw err;
    }

    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    url.searchParams.set('key', key);

    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });

    if (!res.ok) {
        const err = new Error(
            res.status === 401 ? 'RAWG rejected the API key' : `RAWG request failed (${res.status})`,
        ) as Error & { statusCode?: number };
        // 404 means "no such game", which is a client error for us.
        err.statusCode = res.status === 404 ? 404 : 502;
        throw err;
    }

    return res.json();
};

// RAWG gives "2022-02-25", null for unreleased, and a separate `tba` flag.
const year = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const y = Number.parseInt(dateStr.slice(0, 4), 10);
    return Number.isNaN(y) ? null : y;
};

const platformNames = (raw: any): string[] =>
    (raw.platforms ?? []).map((p: any) => p.platform?.name).filter(Boolean);

/**
 * The field drift is total: name/title, released/release_date,
 * background_image/poster_path, description_raw/overview. Normalising here is
 * what lets the controller, the catalogue and the UI stay unchanged.
 */
const mapGame = (g: any): MediaItem & { platforms: string[] } => ({
    type: 'game',
    source: SOURCE,
    externalId: String(g.id),
    title: g.name,
    // RAWG's name_original is the untranslated title, same role as TMDB's
    // original_title (SPEC 4).
    originalTitle: g.name_original || null,
    // RAWG exposes no language field.
    language: null,
    overview: g.description_raw || null,
    releaseYear: year(g.released),
    genres: (g.genres ?? []).map((x: any) => x.name),
    // Minutes, holding RAWG's average playtime in hours.
    //
    // Reusing `runtime` rather than adding a column: for a film it is the
    // length of the film, for a game the expected time investment. Same
    // question, same unit, one column. It is a hint for a default
    // progressTotal, never a promise - RAWG's playtime is a community average.
    runtime: g.playtime ? g.playtime * 60 : null,
    posterUrl: g.background_image || null,
    seasonCount: null,
    episodeCount: null,
    releaseStatus: g.tba ? 'TBA' : g.released ? 'Released' : null,
    platforms: platformNames(g),
});

export const searchGames = async (query: string): Promise<MediaSearchResult[]> => {
    const data = await request('/games', { search: query, page_size: 20, search_precise: true });
    return (data.results ?? []).map((g: any) => ({
        type: 'game' as const,
        source: SOURCE,
        externalId: String(g.id),
        title: g.name,
        releaseYear: year(g.released),
        posterUrl: g.background_image || null,
        // The list endpoint carries no description; the detail call fills it
        // in at add-time, exactly as TMDB search does.
        overview: null,
    }));
};

export const getGameDetails = async (externalId: string) =>
    mapGame(await request(`/games/${externalId}`));

/** Detail plus the extras a public item page shows. */
export const getDetailsWithCast = async (_type: string, externalId: string) => {
    const raw = await request(`/games/${externalId}`);
    return {
        ...mapGame(raw),
        // Games have no cast. Developers are the closest equivalent to a
        // director, and the item page renders `creators` generically.
        cast: [],
        creators: (raw.developers ?? []).map((d: any) => d.name),
    };
};

/** Matches the TMDB adapter's signature so the controller stays source-agnostic. */
export const getDetails = (_type: string, externalId: string) => getGameDetails(externalId);
