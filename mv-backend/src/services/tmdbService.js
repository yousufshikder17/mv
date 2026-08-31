import 'dotenv/config';

// TMDB is proxied through this server rather than called from React so the
// access token never reaches the client bundle (Vite inlines VITE_* vars).

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

const token = process.env.TMDB_ACCESS_TOKEN;

// Poster sizes TMDB serves. w342 is the sweet spot for the card grid.
export const posterUrl = (path, size = 'w342') =>
    path ? `${IMAGE_BASE}/${size}${path}` : null;

const request = async (path, params = {}) => {
    if (!token) {
        const err = new Error('TMDB_ACCESS_TOKEN is not set in mv-backend/.env');
        err.statusCode = 503;
        throw err;
    }

    const url = new URL(`${TMDB_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }

    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        },
    });

    if (!res.ok) {
        const err = new Error(
            res.status === 401
                ? 'TMDB rejected the access token'
                : `TMDB request failed (${res.status})`
        );
        // 404 from TMDB means "no such film", which is a client error for us.
        err.statusCode = res.status === 404 ? 404 : 502;
        throw err;
    }

    return res.json();
};

const releaseYear = (dateStr) => {
    // TMDB gives "2019-05-30", or "" for announced-but-undated films.
    if (!dateStr) return null;
    const year = Number.parseInt(dateStr.slice(0, 4), 10);
    return Number.isNaN(year) ? null : year;
};

/**
 * Lightweight search. TMDB's search endpoint returns genre_ids (not names) and
 * no runtime at all, so these results are only good enough to pick from —
 * getMovieDetails fills in the rest at add-time.
 */
export const searchMovies = async (query) => {
    const data = await request('/search/movie', {
        query,
        include_adult: false,
        language: 'en-US',
        page: 1,
    });

    return (data.results ?? []).map((m) => ({
        tmdbId: m.id,
        title: m.title,
        overview: m.overview || null,
        releaseYear: releaseYear(m.release_date),
        posterUrl: posterUrl(m.poster_path, 'w185'),
    }));
};

/**
 * Trending this week. Same normalized shape as searchMovies, so the client can
 * render both through one component.
 *
 * Shown to signed-in users only (the route sits behind authMiddleware, like
 * search) — this is metadata a user browses in order to track something, not a
 * public catalogue. SPEC §17 is explicit that the tracking layer is table
 * stakes, not the product; this exists so a new vault is not a blank page.
 */
export const getTrending = async () => {
    const data = await request('/trending/movie/week', { language: 'en-US' });

    return (data.results ?? []).map((m) => ({
        tmdbId: m.id,
        title: m.title,
        overview: m.overview || null,
        releaseYear: releaseYear(m.release_date),
        posterUrl: posterUrl(m.poster_path, 'w342'),
    }));
};

/** Full detail fetch — the only call that yields runtime and genre names. */
export const getMovieDetails = async (tmdbId) => {
    const m = await request(`/movie/${tmdbId}`, { language: 'en-US' });

    return {
        tmdbId: m.id,
        title: m.title,
        overview: m.overview || null,
        releaseYear: releaseYear(m.release_date),
        genres: (m.genres ?? []).map((g) => g.name),
        runtime: m.runtime || null,
        posterUrl: posterUrl(m.poster_path),
    };
};
