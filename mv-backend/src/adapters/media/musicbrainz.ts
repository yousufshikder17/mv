import 'dotenv/config';
import type { MediaItem, MediaSearchResult } from './types.ts';

// MusicBrainz - album metadata.
//
// Chosen over Spotify, and the reason is licensing rather than convenience.
//
// SPEC 3 says Spotify metadata may be displayed but never fed into
// recommendations or ML, which is why music was excluded from the recs
// pipeline entirely. It also anticipated this exact swap: "music is excluded
// from the recs pipeline UNTIL MUSICBRAINZ REPLACES SPOTIFY as the metadata
// source." So this does not just avoid a dependency, it unblocks a capability.
//
// Spotify additionally began requiring a Premium subscription to register a
// developer app in February 2026, and started moving metadata endpoints off
// the Client Credentials flow - a recurring cost, for data we would then be
// forbidden from using in the one place we wanted it.
//
// MusicBrainz core data is CC0. There is no licence that can break later,
// which matters when SPEC 3 already lists TMDB's commercial ambiguity as this
// project's live licensing risk.
//
// Their rules: one request per second, and a User-Agent naming the
// application with contact details - they block clients that omit it.

const BASE = 'https://musicbrainz.org/ws/2';
const COVER_ART = 'https://coverartarchive.org';

export const SOURCE = 'musicbrainz';

const USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT ?? 'MediaVault/0.1 (+https://github.com/yousufshikder17/mv)';

// One per second is their published limit for anonymous clients, and they
// enforce it. 1100ms leaves headroom for clock drift rather than sitting
// exactly on the line.
const MIN_GAP_MS = 1100;
let lastCall = 0;

// They return 503 under load with a plain "server is currently busy" body,
// which clears on retry - observed on the very first probe.
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const request = async (path: string, params: Record<string, unknown> = {}) => {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    url.searchParams.set('fmt', 'json');

    let last = 'unknown';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const wait = MIN_GAP_MS - (Date.now() - lastCall);
        if (wait > 0) await sleep(wait);
        lastCall = Date.now();

        const res = await fetch(url, {
            signal: AbortSignal.timeout(20000),
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        });

        if (res.ok) return res.json();
        last = 'HTTP ' + res.status;

        // 503 is their "busy, try again" and clears; 4xx will not.
        if (res.status !== 503 && res.status !== 429) break;
        await sleep(1000 * attempt);
    }

    const err: any = new Error('MusicBrainz request failed (' + last + ')');
    err.statusCode = last === 'HTTP 404' ? 404 : 502;
    throw err;
};

const year = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const y = Number.parseInt(String(dateStr).slice(0, 4), 10);
    return Number.isNaN(y) ? null : y;
};

const artistsOf = (rg: any): string[] =>
    (rg['artist-credit'] ?? []).map((a: any) => a.name ?? a.artist?.name).filter(Boolean);

/**
 * Cover art, from the Cover Art Archive.
 *
 * A separate service, and plenty of release groups have none - the URL is
 * returned unverified rather than spending a request per album to find out.
 * The frontend already handles a poster that fails to load.
 */
export const coverUrl = (releaseGroupId: string, size = 'front-500') =>
    releaseGroupId ? COVER_ART + '/release-group/' + releaseGroupId + '/' + size : null;

// Ranking hints, for the one part of this that IS fixable.
//
// MusicBrainz is a catalogue, not a chart: it has no popularity data at all,
// and 330 release groups are called "Thriller". Every exact title match scores
// 100, so the original and a karaoke cover are indistinguishable to it - the
// Michael Jackson album sits at position 71 for a bare search.
//
// Nothing below fixes that; no signal in their data can. What it does fix is
// the ordering WITHIN a set of results, so that when a search is specific
// enough to find the right artist, the album outranks the single and the
// karaoke version.

const TYPE_RANK: Record<string, number> = {
    Album: 3,
    EP: 2,
    Single: 1,
    Broadcast: 0,
    Other: 0,
};

// Derivative releases. Real, worth keeping, and rarely what someone searching
// a title actually meant.
const SECONDARY_PENALTY: Record<string, number> = {
    Compilation: 2,
    Live: 2,
    Remix: 3,
    Soundtrack: 1,
    Demo: 3,
    Mixtape: 2,
    'DJ-mix': 3,
    Interview: 4,
    Audiobook: 4,
};

const rank = (rg: any): number => {
    let score = (rg.score ?? 0) / 10;
    score += TYPE_RANK[rg['primary-type']] ?? 0;
    for (const secondary of rg['secondary-types'] ?? []) {
        score -= SECONDARY_PENALTY[secondary] ?? 1;
    }
    return score;
};

/**
 * Search release groups - the album-level entity.
 *
 * Release GROUPS rather than releases: a release is one pressing, so "In
 * Rainbows" exists dozens of times over as CD, vinyl and regional editions.
 * Nobody tracks a pressing; they track the album.
 */
export const searchAlbums = async (query: string): Promise<MediaSearchResult[]> => {
    const data = await request('/release-group', { query, limit: 25 });

    return (data['release-groups'] ?? [])
        // MusicBrainz returns a relevance score and does NOT sort by it, and
        // ties on that score are extremely common - every exact title match
        // gets 100. `rank` breaks those ties with the only real signals their
        // data has: an Album beats a Single, and neither is a karaoke remix.
        .sort((a: any, b: any) => rank(b) - rank(a))
        .slice(0, 20)
        .map((rg: any) => ({
            type: 'album' as const,
            source: SOURCE,
            externalId: rg.id,
            // "by" rather than a dash. A dash is ambiguous when either side
            // could be the artist, and MusicBrainz really does contain a
            // release group titled "Radiohead" by an artist called "In
            // Rainbows" - with a dash, the two are indistinguishable in a list.
            title: artistsOf(rg).length ? rg.title + ' by ' + artistsOf(rg).join(', ') : rg.title,
            releaseYear: year(rg['first-release-date']),
            posterUrl: coverUrl(rg.id, 'front-250'),
            overview: null,
        }));
};

export const getAlbumDetails = async (externalId: string): Promise<MediaItem> => {
    const rg = await request('/release-group/' + externalId, { inc: 'artist-credits+tags+genres' });

    // MusicBrainz has both curated `genres` and free-form `tags`. Genres are
    // moderated and reliable; tags are user-supplied and carry the same noise
    // Open Library's subjects did, so they are only a fallback.
    const genres: string[] = (rg.genres ?? [])
        .filter((g: any) => g.name)
        .sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0))
        .map((g: any) => g.name);

    const tags: string[] = (rg.tags ?? [])
        // A tag with one vote is one person's opinion, not a genre.
        .filter((t: any) => t.name && (t.count ?? 0) > 1)
        .sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0))
        .map((t: any) => t.name);

    const titled = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    return {
        type: 'album',
        source: SOURCE,
        externalId,
        title: rg.title,
        originalTitle: null,
        language: null,
        // MusicBrainz is a catalogue, not a review site - there is no
        // description, and inventing one would be worse than the blank.
        overview: null,
        releaseYear: year(rg['first-release-date']),
        genres: (genres.length ? genres : tags).slice(0, 6).map(titled),
        runtime: null,
        pageCount: null,
        posterUrl: coverUrl(externalId),
        seasonCount: null,
        episodeCount: null,
        // Album, EP, Single, Compilation, Live. Exactly what `subtype` is for.
        subtype: rg['primary-type'] ?? null,
        releaseStatus: null,
    } as MediaItem;
};

export const getDetails = (_type: string, externalId: string) => getAlbumDetails(externalId);

export const getDetailsWithCast = async (_type: string, externalId: string) => {
    const rg = await request('/release-group/' + externalId, { inc: 'artist-credits+tags+genres' });
    const item = await getAlbumDetails(externalId);
    // Albums have no cast; the artist is the creator, same shape as a book
    // author or a game developer.
    return { ...item, cast: [], creators: artistsOf(rg) };
};
