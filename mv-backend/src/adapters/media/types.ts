// The one normalized shape every metadata source produces (SPEC §5).
//
// Five-plus sources means five-plus implementations, so a common shape is
// justified. One type, one fetch function per source. No plugin registry, no
// factory, no dynamic loading - this is what makes a TMDB ban an afternoon of
// work rather than a rewrite.

export type MediaType = 'film' | 'tv' | 'book' | 'game' | 'album';

export type MediaItem = {
    type: MediaType;
    /** 'anime', 'manga', 'documentary'... free text; a vocabulary still being discovered. */
    subtype?: string | null;
    /** Which adapter produced this. Half of the catalogue key. */
    source: string;
    /** The source's own id. Only unique WITHIN a source: TMDB 550 != RAWG 550. */
    externalId: string;
    title: string;
    originalTitle?: string | null;
    language?: string | null;
    overview?: string | null;
    releaseYear?: number | null;
    genres?: string[];
    /** Minutes. Per episode for TV; meaningless for books and albums. */
    runtime?: number | null;
    posterUrl?: string | null;
    /** TV only. Null elsewhere. */
    seasonCount?: number | null;
    episodeCount?: number | null;
    /** The source's production status, e.g. 'Returning Series', 'Ended'. */
    releaseStatus?: string | null;
};

/** A search hit. Cheaper than MediaItem - search endpoints omit most fields. */
export type MediaSearchResult = {
    type: MediaType;
    source: string;
    externalId: string;
    title: string;
    releaseYear: number | null;
    posterUrl: string | null;
    overview: string | null;
};

export type Episode = {
    episodeNumber: number;
    name: string | null;
    overview: string | null;
    airDate: string | null;
    runtime: number | null;
};
