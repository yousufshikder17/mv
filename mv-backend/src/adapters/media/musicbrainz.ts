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

/**
 * The same cover, via our own resolver.
 *
 * The archive answers 400 for a release group with no artwork, and search
 * cannot tell in advance which those are - so pointing an <img> at the archive
 * directly meant a failed request per coverless album. This resolves once and
 * remembers; see controllers/coverController.js.
 *
 * Absolute, because in development the frontend is served by Vite on another
 * port and a relative path would resolve against that instead.
 */
export const resolvedCoverUrl = (releaseGroupId: string) =>
    releaseGroupId
        ? (process.env.PUBLIC_URL ?? '') + '/covers/album/' + releaseGroupId
        : null;

// MusicBrainz vocabulary -> the shared RankingSignals shape.
//
// The adapter's job is translation, not ordering. It knows what a release
// group is; it does not decide whether an album should outrank a single,
// because that judgement belongs to the application and applies to every
// source with the same problem. See services/rankingService.js.
const PRIMARY_TYPES: Record<string, 'album' | 'ep' | 'single' | 'other'> = {
    Album: 'album',
    EP: 'ep',
    Single: 'single',
    Broadcast: 'other',
    Other: 'other',
};

const signalsFor = (rg: any) => ({
    // MusicBrainz scores 0-100 already, and famously ties: every exact title
    // match gets 100.
    relevance: rg.score ?? undefined,
    releaseType: PRIMARY_TYPES[rg['primary-type']] ?? 'other',
    variants: (rg['secondary-types'] ?? []).map((v: string) => v.toLowerCase()),
    // Deliberately absent. MusicBrainz is a catalogue, not a chart - it has no
    // popularity data at all, which is the whole reason a bare search for
    // "thriller" puts Michael Jackson at position 71 of 330.
    popularity: undefined,
});

/**
 * Search release groups - the album-level entity.
 *
 * Release GROUPS rather than releases: a release is one pressing, so "In
 * Rainbows" exists dozens of times over as CD, vinyl and regional editions.
 * Nobody tracks a pressing; they track the album.
 */
export const searchAlbums = async (query: string): Promise<MediaSearchResult[]> => {
    // 100, not 25, and this is load-bearing rather than generous.
    //
    // Measured: a bare search for "thriller" puts Michael Jackson's album at
    // position 71. At limit 25 or 50 it is simply not in the candidate set,
    // so no amount of re-ranking or popularity enrichment can rescue it -
    // enrichment can only reorder what the provider returned. At 100 it is
    // present, and its 529,156 listens against 3,916 for the next candidate
    // settle it instantly.
    //
    // Costs one request either way. MusicBrainz caps a page at 100.
    const data = await request('/release-group', { query, limit: 100 });

    // Returned unsorted, on purpose. Ordering happens once, centrally, in the
    // ranking service - provider order is a suggestion and MusicBrainz's is
    // barely that.
    return (data['release-groups'] ?? [])
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
            posterUrl: resolvedCoverUrl(rg.id),
            overview: null,
            ranking: signalsFor(rg),
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
