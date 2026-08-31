import 'dotenv/config';
import type { MediaItem, MediaSearchResult, Episode } from './types.ts';

// TMDB adapter - films and TV. Same key, same token, different endpoints.
//
// Proxied through this server rather than called from React so the access
// token never reaches the client bundle (Vite inlines VITE_* vars).
//
// Everything this returns is a CACHE of TMDB content, not our data: their
// terms forbid retaining it beyond 6 months. See refreshIfStale.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const SOURCE = 'tmdb';

export const posterUrl = (path: string | null, size = 'w342') =>
    path ? `${IMAGE_BASE}/${size}${path}` : null;

const request = async (path: string, params: Record<string, unknown> = {}) => {
    const token = process.env.TMDB_ACCESS_TOKEN;
    if (!token) {
        const err = new Error('TMDB_ACCESS_TOKEN is not set in mv-backend/.env') as Error & { statusCode?: number };
        err.statusCode = 503;
        throw err;
    }

    const url = new URL(`${TMDB_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!res.ok) {
        const err = new Error(
            res.status === 401 ? 'TMDB rejected the access token' : `TMDB request failed (${res.status})`,
        ) as Error & { statusCode?: number };
        // 404 from TMDB means "no such title", which is a client error for us.
        err.statusCode = res.status === 404 ? 404 : 502;
        throw err;
    }

    return res.json();
};

// TMDB gives "2019-05-30", or "" for announced-but-undated titles.
const year = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const y = Number.parseInt(dateStr.slice(0, 4), 10);
    return Number.isNaN(y) ? null : y;
};

// The field drift between films and TV is the entire difference between them:
// title/name, release_date/first_air_date, one runtime/many. Normalising it
// here is what lets everything downstream stop caring which it is.

export const searchFilms = async (query: string): Promise<MediaSearchResult[]> => {
    const data = await request('/search/movie', { query, include_adult: false, language: 'en-US', page: 1 });
    return (data.results ?? []).map((m: any) => ({
        type: 'film' as const,
        source: SOURCE,
        externalId: String(m.id),
        title: m.title,
        releaseYear: year(m.release_date),
        posterUrl: posterUrl(m.poster_path, 'w185'),
        overview: m.overview || null,
    }));
};

export const searchTv = async (query: string): Promise<MediaSearchResult[]> => {
    const data = await request('/search/tv', { query, include_adult: false, language: 'en-US', page: 1 });
    return (data.results ?? []).map((s: any) => ({
        type: 'tv' as const,
        source: SOURCE,
        externalId: String(s.id),
        // name, not title.
        title: s.name,
        // first_air_date, not release_date.
        releaseYear: year(s.first_air_date),
        posterUrl: posterUrl(s.poster_path, 'w185'),
        overview: s.overview || null,
    }));
};

/** Searches both and interleaves by TMDB's own popularity ordering. */
export const searchAll = async (query: string): Promise<MediaSearchResult[]> => {
    const [films, shows] = await Promise.all([searchFilms(query), searchTv(query)]);
    const out: MediaSearchResult[] = [];
    for (let i = 0; i < Math.max(films.length, shows.length); i++) {
        if (films[i]) out.push(films[i]);
        if (shows[i]) out.push(shows[i]);
    }
    return out;
};

/**
 * Trending films this week. Shown to signed-in users so a new vault is not a
 * blank page; nothing enters our catalogue until someone actually adds one.
 */
export const getTrending = async (): Promise<MediaSearchResult[]> => {
    const data = await request('/trending/movie/week', { language: 'en-US' });
    return (data.results ?? []).map((m: any) => ({
        type: 'film' as const,
        source: SOURCE,
        externalId: String(m.id),
        title: m.title,
        releaseYear: year(m.release_date),
        posterUrl: posterUrl(m.poster_path),
        overview: m.overview || null,
    }));
};

export const getFilmDetails = async (externalId: string): Promise<MediaItem> => {
    const m = await request(`/movie/${externalId}`, { language: 'en-US' });
    return {
        type: 'film',
        source: SOURCE,
        externalId: String(m.id),
        title: m.title,
        // SPEC §4: a non-English user gets a materially worse product without these.
        originalTitle: m.original_title || null,
        language: m.original_language || null,
        overview: m.overview || null,
        releaseYear: year(m.release_date),
        genres: (m.genres ?? []).map((g: any) => g.name),
        runtime: m.runtime || null,
        posterUrl: posterUrl(m.poster_path),
        seasonCount: null,
        episodeCount: null,
        releaseStatus: m.status || null,
    };
};

export const getTvDetails = async (externalId: string): Promise<MediaItem> => {
    const s = await request(`/tv/${externalId}`, { language: 'en-US' });
    return {
        type: 'tv',
        source: SOURCE,
        externalId: String(s.id),
        title: s.name,
        originalTitle: s.original_name || null,
        language: s.original_language || null,
        overview: s.overview || null,
        releaseYear: year(s.first_air_date),
        genres: (s.genres ?? []).map((g: any) => g.name),
        // TV has no single runtime. episode_run_time is an array, often empty
        // for shows with variable episode lengths - take the first as a hint,
        // never as a promise.
        runtime: s.episode_run_time?.[0] ?? null,
        posterUrl: posterUrl(s.poster_path),
        seasonCount: s.number_of_seasons ?? null,
        episodeCount: s.number_of_episodes ?? null,
        // 'Returning Series' | 'Ended' | 'Canceled' | 'In Production'.
        // Drives a shorter cache TTL - see refreshIfStale.
        releaseStatus: s.status || null,
    };
};

/** Episodes of one season. Only TV has these. */
export const getSeason = async (externalId: string, seasonNumber: number): Promise<Episode[]> => {
    const s = await request(`/tv/${externalId}/season/${seasonNumber}`, { language: 'en-US' });
    return (s.episodes ?? []).map((e: any) => ({
        episodeNumber: e.episode_number,
        name: e.name || null,
        overview: e.overview || null,
        airDate: e.air_date || null,
        runtime: e.runtime ?? null,
    }));
};

/** Details for either type, chosen by what the catalogue row says it is. */
export const getDetails = (type: string, externalId: string): Promise<MediaItem> =>
    type === 'tv' ? getTvDetails(externalId) : getFilmDetails(externalId);
