import { cached } from '../../utils/cache.js';

/**
 * iTunes Search — album artwork the open catalogues do not have.
 *
 * Cover Art Archive is contributor-supplied, so a real album can simply have
 * no cover in it. Measured on a live ListenBrainz response: 216 of 1366
 * albums. Dropping those from the row would be worse than showing them
 * without art, because it silently reorders a popularity chart by who
 * happened to upload a scan.
 *
 * iTunes is the fallback rather than the source: no key, no auth, and Apple
 * has artwork for anything commercially released. It knows nothing about
 * MusicBrainz IDs, so the match is by artist and title — which is exactly the
 * fuzzy matching ListenBrainz was chosen to avoid for *popularity*, where
 * attaching one album's listens to another would corrupt the ranking. Artwork
 * is a different risk: the failure is a wrong picture, not a wrong number, and
 * it is visible to anyone looking at the page.
 *
 * ONE fallback, not a chain. Each extra source multiplies requests and
 * latency for a shrinking return, and the sources after this one get much
 * looser about what counts as a match.
 */

const ENDPOINT = 'https://itunes.apple.com/search';

// Apple asks for no more than about 20 calls a minute. A browse row needs a
// handful at most, and only for the albums CAA is missing.
const MAX_LOOKUPS = 8;

const TIMEOUT_MS = 4000;

// A week. Artwork does not change, and a negative result is worth caching just
// as long — an album with no cover on iTunes will not grow one by Thursday,
// and re-asking every day is the same request forever.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 100x100 is what search returns; the same URL serves any size. */
const upscale = (url, size = 600) =>
    typeof url === 'string' ? url.replace(/\/100x100bb\.jpg$/, `/${size}x${size}bb.jpg`) : null;

/**
 * Artwork for one album, or null.
 *
 * Null is cached too, which is the point of returning it rather than throwing.
 */
export const albumCover = async (artist, title) => {
    if (!artist || !title) return null;

    const term = `${artist} ${title}`;

    return cached(`itunes:cover:${term.toLowerCase()}`, TTL_MS, async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const url = `${ENDPOINT}?term=${encodeURIComponent(term)}&entity=album&limit=1`;
            const res = await fetch(url, { signal: controller.signal });
            // Artwork is decoration. A failure here must cost a picture, never
            // the row it was going to sit in.
            if (!res.ok) return null;

            const body = await res.json();
            const hit = body?.results?.[0];
            if (!hit) return null;

            // Guard the obvious mismatch. iTunes always returns its best
            // guess, so an unrelated album comes back looking like a hit, and
            // a wrong cover is worse than none.
            const artistMatches = String(hit.artistName ?? '').toLowerCase()
                .includes(String(artist).toLowerCase().slice(0, 12));
            if (!artistMatches) return null;

            return upscale(hit.artworkUrl100);
        } catch {
            return null;
        } finally {
            clearTimeout(timer);
        }
    });
};

/**
 * Fills in `posterUrl` for whichever rows are missing one.
 *
 * Bounded and parallel: the lookups are independent, and a browse row should
 * not wait on eight sequential round trips for decoration.
 */
export const backfillCovers = async (rows) => {
    const missing = rows.filter((r) => !r.posterUrl).slice(0, MAX_LOOKUPS);
    if (!missing.length) return rows;

    const found = new Map(
        await Promise.all(
            missing.map(async (r) => [r.externalId, await albumCover(r.artist, r.name)]),
        ),
    );

    return rows.map((r) =>
        r.posterUrl ? r : { ...r, posterUrl: found.get(r.externalId) ?? null });
};
