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
    /** Books only. Median across editions, so a hint rather than a promise. */
    pageCount?: number | null;
    /** TV only. Null elsewhere. */
    seasonCount?: number | null;
    episodeCount?: number | null;
    /** The source's production status, e.g. 'Returning Series', 'Ended'. */
    releaseStatus?: string | null;
};

/** A search hit. Cheaper than MediaItem - search endpoints omit most fields. */
/**
 * Signals a ranking pass can use, carried on a normalized result.
 *
 * These exist because provider order is not trustworthy and provider-specific
 * fields must not leak past the adapter. MusicBrainz returns a relevance score
 * it does not sort by, plus release types that distinguish an album from a
 * karaoke remix; TMDB returns popularity. Adapters translate whatever they
 * have into this shape, and the ranking service is the only thing that reads
 * it.
 *
 * Every field is optional: an adapter that has no such signal simply omits it,
 * and ranking falls back to provider order.
 */
export type RankingSignals = {
    /** The provider's own relevance, normalized to 0-100. */
    relevance?: number;
    /** Primary release/edition type, where the source distinguishes them. */
    releaseType?: 'album' | 'ep' | 'single' | 'other';
    /**
     * Secondary classifications marking a derivative release - karaoke,
     * remix, live, compilation. Lowercased by the adapter.
     */
    variants?: string[];
    /** A popularity proxy, when a source has one. MusicBrainz has none. */
    popularity?: number;
};

export type MediaSearchResult = {
    type: MediaType;
    source: string;
    externalId: string;
    title: string;
    releaseYear: number | null;
    posterUrl: string | null;
    overview: string | null;
    /** Optional. Read only by the ranking service. */
    ranking?: RankingSignals;
};

export type Episode = {
    episodeNumber: number;
    name: string | null;
    overview: string | null;
    airDate: string | null;
    runtime: number | null;
};
