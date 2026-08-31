import 'dotenv/config';
import { cached } from '../../utils/cache.js';

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
