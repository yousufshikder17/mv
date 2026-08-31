import * as tmdb from './tmdb.ts';
import * as rawg from './rawg.ts';
import * as openlibrary from './openlibrary.ts';
import type { MediaSearchResult, MediaType } from './types.ts';

/**
 * Which adapter owns which source and which media type.
 *
 * A plain object, not a plugin registry - SPEC 5 rules out "no plugin
 * registry, no factory, no dynamic loading", and this is a static lookup
 * written out in full. Adding a source is a line here and a new file.
 */
const BY_SOURCE = { tmdb, rawg, openlibrary } as const;

const BY_TYPE = {
    film: tmdb,
    tv: tmdb,
    game: rawg,
    // Open Library, not Google Books. Google Books returned 503 on ~40% of
    // calls when measured, which is survivable for the daily price poller and
    // not for a search box. Google Books keeps the prices; Open Library
    // answers the requests.
    book: openlibrary,
} as const;

export type Source = keyof typeof BY_SOURCE;

/** The adapter that produced a catalogue row. Never guess from type alone. */
export const adapterForSource = (source: string) =>
    BY_SOURCE[source as Source] ?? null;

/** The adapter that owns a media type, for a fresh lookup. */
export const adapterForType = (type: string) =>
    BY_TYPE[type as keyof typeof BY_TYPE] ?? null;

export const SEARCHABLE_TYPES: MediaType[] = ['film', 'tv', 'game', 'book'];

const searchOne = (type: string, query: string): Promise<MediaSearchResult[]> => {
    if (type === 'tv') return tmdb.searchTv(query);
    if (type === 'game') return rawg.searchGames(query);
    if (type === 'book') return openlibrary.searchBooks(query);
    return tmdb.searchFilms(query);
};

export const search = (type: string | undefined, query: string) =>
    type ? searchOne(type, query) : searchAll(query);

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
