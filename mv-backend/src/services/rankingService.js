/**
 * Application-owned ranking for search results.
 *
 * The point is in the name: the application decides the order, not the
 * provider. Provider order is a suggestion, and for MusicBrainz it is barely
 * that - it returns a relevance score it does not sort by, and every exact
 * title match scores 100, so an album, a karaoke cover and a tribute arrive
 * indistinguishable.
 *
 * Centralised deliberately. These constants used to live inside the
 * MusicBrainz adapter, which meant the rules were invisible from anywhere the
 * ordering was actually experienced, and unavailable to any other source with
 * the same problem.
 *
 * Adapters translate whatever they know into RankingSignals; nothing here
 * knows what a release group or a TMDB popularity figure is.
 */

// An album is what people track. A single sharing its name is usually not
// what they meant, and neither is a broadcast recording.
const RELEASE_TYPE_SCORE = {
    album: 3,
    ep: 2,
    single: 1,
    other: 0,
};

// Derivative releases. Real records worth keeping in the catalogue, and rarely
// the thing someone searching a title had in mind.
const VARIANT_PENALTY = {
    karaoke: 5,
    tribute: 5,
    remix: 3,
    demo: 3,
    'dj-mix': 3,
    interview: 4,
    audiobook: 4,
    live: 2,
    compilation: 2,
    mixtape: 2,
    soundtrack: 1,
};

// Tuned against scripts/benchmark-music.mjs, not guessed.
//
// The first pass used relevance 0.45 / confidence 0.10 and measured top-1 at
// 50% - no better than provider order - because MusicBrainz relevance is
// nearly useless here: every exact title match scores 100, so a 0.45 weight
// on a constant just amplifies noise. Meanwhile the one reliable signal,
// whether the title actually IS what was typed, was weighted 0.10.
//
// Confidence now dominates. Release quality matters more than relevance too,
// because "is this a karaoke tribute" is real information and "did the words
// appear" is not.
//
// Popularity keeps a high weight while contributing nothing: MusicBrainz has
// none, so it scores neutral for every row and cannot affect ordering. The
// weight is there for when an enrichment provider supplies it - at which
// point this needs re-measuring, not assuming.
const WEIGHTS = {
    relevance: 0.15,
    // Raised from 0.30 once ListenBrainz supplied real numbers. For a bare
    // title query it is the ONLY signal that separates an album from a band
    // named after it - local heuristics see two identical exact matches, and
    // measured listen counts differ by two orders of magnitude.
    popularity: 0.50,
    releaseQuality: 0.25,
    confidence: 0.60,
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * How well a result matches what was typed.
 *
 * Exact title match is the strongest local signal available when the provider
 * cannot rank. An exact ARTIST match matters too, because "thriller michael
 * jackson" should beat a tribute album whose title contains both words.
 */
export const matchConfidence = (query, result) => {
    const q = norm(query);
    if (!q) return 0;

    const title = norm(result.title);
    if (!title) return 0;

    // Titles are formatted "Album by Artist" for music, so compare against
    // both halves as well as the whole.
    const [albumPart, artistPart] = String(result.title).split(' by ');
    const album = norm(albumPart);
    const artist = norm(artistPart);

    let score = 0;
    if (title === q) score += 10;
    if (album && album === q) score += 8;

    // Every word of the query present somewhere. Catches "thriller michael
    // jackson" matching "Thriller by Michael Jackson".
    const words = q.split(' ').filter(Boolean);
    const found = words.filter((w) => title.includes(w));
    score += (found.length / words.length) * 6;

    // The query names the artist explicitly - but only credit a word that is
    // not already the album title.
    //
    // Otherwise a band named after its own album collects the bonus twice:
    // on a bare "thriller" query, "Thriller by Thriller" scored the artist
    // match that "Thriller by Michael Jackson" could not, and outranked it.
    const albumWords = new Set(album.split(' ').filter(Boolean));
    if (artist && words.some((w) => w.length > 2 && artist.includes(w) && !albumWords.has(w))) {
        score += 4;
    }

    // Words in the TITLE that were not asked for.
    //
    // Scoped to the album portion, never the artist. Music titles are
    // formatted "Album by Artist" for display, so counting the whole string
    // penalised "Thriller by Michael Jackson" two words for naming its own
    // artist - on a bare "thriller" query that put it behind a band literally
    // called Thriller, and popularity could not close the gap.
    //
    // Judged on the album alone, it is exact. What still gets penalised is the
    // thing this is for: "Michael Jackson - Thriller" (a book), "Back to Black
    // (Amy Winehouse cover)", "Vitamin String Quartet performs...".
    const queryWords = new Set(words);
    const compared = album || title;
    const extra = compared.split(' ').filter((w) => w && !queryWords.has(w));
    score -= Math.min(extra.length * 2, 10);

    return score;
};

/** Release-type and variant quality, independent of the query. */
export const releaseQuality = (signals = {}) => {
    let score = RELEASE_TYPE_SCORE[signals.releaseType] ?? 0;
    for (const variant of signals.variants ?? []) {
        score -= VARIANT_PENALTY[variant] ?? 1;
    }
    return score;
};

/**
 * Final score for one result. Exported so the benchmark can explain an
 * ordering rather than just report it.
 */
export const scoreResult = (query, result) => {
    const signals = result.ranking ?? {};

    const relevance = (signals.relevance ?? 50) / 10;
    // Popularity is absent for MusicBrainz today. Scored as neutral rather
    // than zero, so a source without it is not systematically punished.
    const popularity = signals.popularity != null ? signals.popularity / 10 : 5;
    const quality = releaseQuality(signals);
    const confidence = matchConfidence(query, result);

    return (
        WEIGHTS.relevance * relevance +
        WEIGHTS.popularity * popularity +
        WEIGHTS.releaseQuality * quality +
        WEIGHTS.confidence * confidence
    );
};

/**
 * Orders results. Stable: equal scores keep provider order, so ranking never
 * shuffles results it has no opinion about.
 */
export const rankResults = (query, results = []) => {
    return results
        .map((result, index) => ({ result, index, score: scoreResult(query, result) }))
        .sort((a, b) => (b.score - a.score) || (a.index - b.index))
        .map((x) => x.result);
};

export const RANKING_WEIGHTS = WEIGHTS;
