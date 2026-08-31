import * as tmdb from './tmdb.ts';
import * as rawg from './rawg.ts';
import * as openlibrary from './openlibrary.ts';
import * as musicbrainz from './musicbrainz.ts';
import type { MediaSearchResult, MediaType } from './types.ts';
import { rankResults } from '../../services/rankingService.js';

/**
 * Which adapter owns which source and which media type.
 *
 * A plain object, not a plugin registry - SPEC 5 rules out "no plugin
 * registry, no factory, no dynamic loading", and this is a static lookup
 * written out in full. Adding a source is a line here and a new file.
 */
const BY_SOURCE = { tmdb, rawg, openlibrary, musicbrainz } as const;

const BY_TYPE = {
    film: tmdb,
    tv: tmdb,
    game: rawg,
    // Open Library, not Google Books. Google Books returned 503 on ~40% of
    // calls when measured, which is survivable for the daily price poller and
    // not for a search box. Google Books keeps the prices; Open Library
    // answers the requests.
    book: openlibrary,
    // MusicBrainz, not Spotify. CC0 core data with no restriction on
    // recommendations - which is what SPEC 3 said would unblock music for
    // recs, and which Spotify's terms forbid outright.
    album: musicbrainz,
} as const;

export type Source = keyof typeof BY_SOURCE;

/** The adapter that produced a catalogue row. Never guess from type alone. */
export const adapterForSource = (source: string) =>
    BY_SOURCE[source as Source] ?? null;

/** The adapter that owns a media type, for a fresh lookup. */
export const adapterForType = (type: string) =>
    BY_TYPE[type as keyof typeof BY_TYPE] ?? null;

export const SEARCHABLE_TYPES: MediaType[] = ['film', 'tv', 'game', 'book', 'album'];

const searchOne = (type: string, query: string): Promise<MediaSearchResult[]> => {
    if (type === 'tv') return tmdb.searchTv(query);
    if (type === 'game') return rawg.searchGames(query);
    if (type === 'book') return openlibrary.searchBooks(query);
    if (type === 'album') return musicbrainz.searchAlbums(query);
    return tmdb.searchFilms(query);
};

/**
 * Search, with ordering owned here rather than by whichever provider answered.
 *
 * Every result passes through the ranking service, including single-type
 * searches. Provider order is a suggestion: MusicBrainz returns a relevance
 * score it does not sort by, and TMDB's ordering is popularity rather than
 * relevance to what was typed.
 */
export const search = async (type: string | undefined, query: string) => {
    const results = type ? await searchOne(type, query) : await searchAll(query);
    return rankResults(query, results);
};

/**
 * Every type at once, interleaved.
 *
 * Round-robin rather than concatenated so no single type buries the others -
 * films are the largest catalogue and would otherwise fill the first screen.
 * One failing source must not lose the rest: a RAWG outage should still return
 * films and shows.
 */
export const searchAll = async (query: string): Promise<MediaSearchResult[]> => {
    const settled = await Promise.allSettled(SEARCHABLE_TYPES.map((t) => searchOne(t, query)));
    const lists = settled.map((r) => (r.status === 'fulfilled' ? r.value : []));

    const out: MediaSearchResult[] = [];
    const longest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < longest; i++) {
        for (const list of lists) if (list[i]) out.push(list[i]);
    }
    return out;
};
