import 'dotenv/config';
import { cached } from '../../utils/cache.js';
import { backfillCovers } from './itunes.js';

/**
 * ListenBrainz - popularity enrichment for music.
 *
 * The signal MusicBrainz structurally lacks. MusicBrainz is a catalogue, not a
 * chart: a bare search for "thriller" returns 330 release groups all scoring
 * 100, and it cannot tell the album from a karaoke cover. ListenBrainz can -
 * measured, Michael Jackson's Thriller has 529,156 listens against 3,916 for
 * the next candidate.
 *
 * Chosen over Last.fm for three reasons:
 *
 *   1. CC0, like MusicBrainz. Last.fm is non-commercial-only, which would
 *      have doubled the licensing exposure SPEC 3 already flags for TMDB.
 *   2. Same foundation, so it is keyed by MusicBrainz IDs natively. There is
 *      no fuzzy artist+title matching, and therefore no risk of attaching one
 *      album's popularity to another's row.
 *   3. Batched. One POST enriches a hundred candidates, so there is no N+1.
 *
 * Enrichment is strictly optional. Music search must work without it.
 */

const ENDPOINT = 'https://api.listenbrainz.org/1/popularity/release-group';

const USER_AGENT =
  process.env.LISTENBRAINZ_USER_AGENT ?? 'MediaVault/0.1 (+https://github.com/yousufshikder17/mv)';

// Listen counts move slowly. A day is far fresher than the data needs, and
// keeps a repeated search off their servers entirely.
const TTL_MS = 24 * 60 * 60 * 1000;

// Their limit per request. Also the point past which enriching more candidates
// stops being worth a slower search.
const MAX_BATCH = 100;

const TIMEOUT_MS = 6000;

export const SOURCE = 'listenbrainz';

export const enrichmentStats = { calls: 0, failures: 0, enriched: 0 };

/**
 * Listen counts for release-group MBIDs.
 *
 * Returns a Map, empty on any failure. Never throws: a popularity lookup that
 * can break search is worse than no popularity at all.
 */
export const popularityFor = async (mbids = []) => {
    const wanted = [...new Set(mbids.filter(Boolean))].slice(0, MAX_BATCH);
    if (!wanted.length) return new Map();

    // Keyed on the MBIDs themselves, never on the search text - titles are
    // ambiguous, which is the entire problem this exists to solve.
    const key = 'listenbrainz:' + wanted.slice().sort().join(',');

    try {
        const rows = await cached(key, TTL_MS, async () => {
            enrichmentStats.calls += 1;

            const res = await fetch(ENDPOINT, {
                method: 'POST',
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
                body: JSON.stringify({ release_group_mbids: wanted }),
            });

            if (!res.ok) throw new Error('ListenBrainz responded ' + res.status);
            return res.json();
        });

        const out = new Map();
        for (const row of rows ?? []) {
            if (!row?.release_group_mbid) continue;
            out.set(row.release_group_mbid, {
                listens: row.total_listen_count ?? 0,
                listeners: row.total_user_count ?? 0,
            });
        }
        enrichmentStats.enriched += out.size;
        return out;
    } catch {
        // Times out, rate limits, malformed, unavailable - all the same
        // answer: carry on with MusicBrainz and local ranking.
        enrichmentStats.failures += 1;
        return new Map();
    }
};

/**
 * Listener counts for ARTIST MBIDs.
 *
 * The same shape as popularityFor, against the artist endpoint. It exists
 * because a brand-new release has no listens of its own - the release-group
 * numbers for anything in fresh-releases are all genuinely zero - but the
 * artist behind it usually does, and that is the signal that separates a new
 * album by someone people listen to from one uploaded an hour ago by nobody.
 */
export const artistPopularityFor = async (mbids = []) => {
    const wanted = [...new Set(mbids.filter(Boolean))].slice(0, MAX_BATCH);
    if (!wanted.length) return new Map();

    const key = 'listenbrainz:artist:' + wanted.slice().sort().join(',');

    try {
        const rows = await cached(key, TTL_MS, async () => {
            enrichmentStats.calls += 1;
            const res = await fetch('https://api.listenbrainz.org/1/popularity/artist', {
                method: 'POST',
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
                body: JSON.stringify({ artist_mbids: wanted }),
            });
            if (!res.ok) throw new Error('ListenBrainz responded ' + res.status);
            return res.json();
        });

        const out = new Map();
        for (const row of rows ?? []) {
            if (!row?.artist_mbid) continue;
            out.set(row.artist_mbid, {
                listens: row.total_listen_count ?? 0,
                listeners: row.total_user_count ?? 0,
            });
        }
        return out;
    } catch {
        enrichmentStats.failures += 1;
        return new Map();
    }
};

/**
 * Listen counts to a 0-100 score.
 *
 * Logarithmic, because raw counts span five orders of magnitude and a linear
 * scale would let one megahit flatten every other signal to nothing. What
 * matters is the gap between "hundreds of thousands" and "a few thousand",
 * not its exact size.
 */
export const popularityScore = (listens = 0) => {
    if (!listens || listens < 1) return 0;
    return Math.min(100, Math.log10(listens) * 18);
};

/**
 * Attaches popularity to normalized search results.
 *
 * Results are returned unchanged on failure, which is what makes this safe to
 * call unconditionally.
 */
export const enrich = async (results = []) => {
    if (!results.length) return results;

    const popularity = await popularityFor(results.map((r) => r.externalId));
    if (!popularity.size) return results;

    return results.map((result) => {
        const hit = popularity.get(result.externalId);
        if (!hit) return result;
        return {
            ...result,
            ranking: {
                ...(result.ranking ?? {}),
                popularity: popularityScore(hit.listens),
            },
        };
    });
};

/**
 * Browse: recent releases, ordered by how much they are actually being played.
 *
 * The one music row we can honestly build. MusicBrainz is a catalogue with no
 * chart in it, so "popular albums" has to come from listening data, and this
 * is the only CC0 source of that.
 *
 * Ranked by ARTIST, and that is the whole trick.
 *
 * The listen counts in this endpoint's own response are useless - measured on
 * a live response, all 1366 albums came back with listen_count: 0. Sorting on
 * them was a no-op that left the API's own ordering intact, which is roughly
 * alphabetical by artist, and produced a row of records nobody has heard under
 * a heading that said "popular".
 *
 * The release-group popularity endpoint does not rescue it either: these came
 * out in the last month, so their own counts are genuinely zero. The artist
 * behind them is not. An album by someone with fourteen thousand listeners is
 * a different proposition from one uploaded an hour ago by an act with none,
 * and that is the difference this sorts on.
 *
 * It is also the answer to obscure or machine-generated releases padding the
 * row. They are not detected and filtered - they simply do not rank, because
 * nobody is listening to the artist. No classifier, no maintained blocklist,
 * and nothing to go stale.
 *
 * Two details the API forces:
 *   - the trailing slash is required; without it the endpoint 308s and the
 *     redirect is not followed by fetch's default settings here.
 *   - `sort` accepts only release_date, artist_credit_name or release_name.
 *
 * Singles and EPs are filtered out. A browse row for albums that is half
 * singles is not an album row.
 *
 * Albums with no cover art are KEPT. 216 of 1366 carry no caa_id on a live
 * response, and dropping them would quietly reorder a popularity chart by who
 * happened to upload a scan - which is not what the row claims to measure.
 * Instead the art is looked up from iTunes, and anything still missing after
 * that renders through the poster placeholder.
 */
export const browseAlbums = async (limit = 20) => {
    const url = 'https://api.listenbrainz.org/1/explore/fresh-releases/?days=30&past=true&future=false';

    return cached('lb:fresh-releases', TTL_MS, async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
                signal: controller.signal,
            });
            // Browse is not worth failing a page over: an empty row renders as
            // an honest "nothing here", which beats an error on a nav link.
            if (!res.ok) return [];

            const body = await res.json();
            const releases = body?.payload?.releases ?? [];

            // A wide candidate pool, narrowed by who is actually listened to
            // rather than by the order they happened to arrive in. Capped at
            // the popularity endpoint's own batch limit.
            const candidates = releases
                .filter((r) => r.release_group_primary_type === 'Album' && r.release_group_mbid)
                .slice(0, MAX_BATCH);

            const artists = await artistPopularityFor(
                candidates.map((r) => r.artist_mbids?.[0]),
            );

            const albums = candidates
                .map((r) => ({
                    r,
                    // Listeners, not listens. One devoted fan can play a record
                    // ten thousand times; ten thousand people cannot pretend to
                    // be an audience.
                    listeners: artists.get(r.artist_mbids?.[0])?.listeners ?? 0,
                }))
                .sort((a, b) => b.listeners - a.listeners)
                .slice(0, limit)
                .map(({ r, listeners }) => ({
                    type: 'album',
                    source: 'musicbrainz',
                    // The release GROUP id, which is what our catalogue keys
                    // albums by - not the release id sitting next to it.
                    externalId: r.release_group_mbid,
                    title: r.artist_credit_name
                        ? r.release_name + ' by ' + r.artist_credit_name
                        : r.release_name,
                    releaseYear: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
                    // Keyed by the exact release and image ListenBrainz named,
                    // not by the release group: the group endpoint has to pick
                    // a release for us and can miss, whereas this pair came
                    // back in the response and is therefore known to resolve.
                    // Null when the archive simply has no scan.
                    posterUrl: r.caa_id && r.caa_release_mbid
                        ? 'https://coverartarchive.org/release/'
                            + r.caa_release_mbid + '/' + r.caa_id + '-250.jpg'
                        : null,
                    overview: null,
                    // What it was ranked on, so the row can say so rather than
                    // asking anyone to take the ordering on trust.
                    artistListeners: listeners,
                    // Kept for the artwork fallback, which matches on text
                    // because iTunes knows nothing about MusicBrainz IDs.
                    artist: r.artist_credit_name ?? null,
                    name: r.release_name ?? null,
                }));

            return backfillCovers(albums);
        } catch {
            return [];
        } finally {
            clearTimeout(timer);
        }
    });
};
