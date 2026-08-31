import { describe, it, expect } from 'vitest';
import { rankResults, matchConfidence, releaseQuality, RANKING_WEIGHTS } from '../src/services/rankingService.js';

const result = (title, ranking = {}) => ({
    type: 'album', source: 'musicbrainz', externalId: title,
    title, releaseYear: 2000, posterUrl: null, overview: null,
    ranking: { relevance: 100, releaseType: 'album', variants: [], ...ranking },
});

// Ranking is application-owned: provider order is a suggestion, and
// MusicBrainz's is barely that - every exact title match scores 100, so ties
// are the normal case rather than the exception.
describe('the extra-word penalty', () => {
    it('puts the album above a book named after it', () => {
        // Measured failure: "Michael Jackson - Thriller by Kent Nishimura"
        // outranked the album, because both matched every query word and the
        // two extra words were free.
        const ranked = rankResults('thriller michael jackson', [
            result('Michael Jackson - Thriller by Kent Nishimura'),
            result('Thriller by Michael Jackson'),
        ]);
        expect(ranked[0].title).toBe('Thriller by Michael Jackson');
    });

    it('puts the album above a cover version', () => {
        const ranked = rankResults('back to black amy winehouse', [
            result('Back to Black (Amy Winehouse cover) by Oscar'),
            result('Back to Black by Amy Winehouse'),
        ]);
        expect(ranked[0].title).toBe('Back to Black by Amy Winehouse');
    });

    it('does NOT catch a compilation that only repeats query words', () => {
        // Honest limitation. "Fleetwood Mac / Rumours by Fleetwood Mac" adds
        // no words that were not asked for, so the extra-word penalty sees
        // nothing. Live, that case is fixed by the compilation VARIANT
        // penalty instead - a different signal, asserted below. Pinning it
        // here would credit the wrong mechanism and hide the gap.
        const ranked = rankResults('rumours fleetwood mac', [
            result('Fleetwood Mac / Rumours by Fleetwood Mac'),
            result('Rumours by Fleetwood Mac'),
        ]);
        expect(ranked).toHaveLength(2);
    });

    it('catches that compilation through its variant marking', () => {
        const ranked = rankResults('rumours fleetwood mac', [
            result('Fleetwood Mac / Rumours by Fleetwood Mac', { variants: ['compilation'] }),
            result('Rumours by Fleetwood Mac'),
        ]);
        expect(ranked[0].title).toBe('Rumours by Fleetwood Mac');
    });
});

describe('release type and variants', () => {
    it('prefers an album to a single of the same name', () => {
        const ranked = rankResults('thriller', [
            result('Thriller by Michael Jackson', { releaseType: 'single' }),
            result('Thriller by Michael Jackson', { releaseType: 'album' }),
        ]);
        expect(ranked[0].ranking.releaseType).toBe('album');
    });

    it('penalises karaoke and tribute releases hardest', () => {
        expect(releaseQuality({ releaseType: 'album', variants: ['karaoke'] }))
            .toBeLessThan(releaseQuality({ releaseType: 'album', variants: ['live'] }));
    });

    it('leaves a plain album unpenalised', () => {
        expect(releaseQuality({ releaseType: 'album', variants: [] })).toBeGreaterThan(0);
    });

    it('treats an unknown variant as mildly negative rather than ignoring it', () => {
        expect(releaseQuality({ releaseType: 'album', variants: ['something-new'] }))
            .toBeLessThan(releaseQuality({ releaseType: 'album', variants: [] }));
    });
});

describe('match confidence', () => {
    it('rewards an exact album title', () => {
        expect(matchConfidence('nevermind', result('Nevermind by Nirvana')))
            .toBeGreaterThan(matchConfidence('nevermind', result('Nevermind Remixed by Various')));
    });

    it('rewards the query naming the artist', () => {
        const withArtist = matchConfidence('thriller michael jackson', result('Thriller by Michael Jackson'));
        const withoutArtist = matchConfidence('thriller michael jackson', result('Thriller by Somebody Else'));
        expect(withArtist).toBeGreaterThan(withoutArtist);
    });

    it('returns zero for an empty query rather than dividing by nothing', () => {
        expect(matchConfidence('', result('Anything'))).toBe(0);
    });
});

describe('ranking is stable and safe', () => {
    it('keeps provider order when it has no opinion', () => {
        // A ranking pass that shuffles results it cannot distinguish is worse
        // than none - it makes ordering unreproducible.
        const items = [result('Alpha'), result('Beta'), result('Gamma')];
        expect(rankResults('zzz nothing matches', items).map((r) => r.title))
            .toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('handles results carrying no ranking signals at all', () => {
        // Adapters without signals must not crash the pipeline; they fall
        // back to provider order.
        const bare = [
            { title: 'One', type: 'film', source: 'tmdb' },
            { title: 'Two', type: 'film', source: 'tmdb' },
        ];
        expect(rankResults('one', bare)).toHaveLength(2);
    });

    it('handles an empty result set', () => {
        expect(rankResults('anything', [])).toEqual([]);
        expect(rankResults('anything')).toEqual([]);
    });
});

// The first weighting was guessed and measured top-1 at 50%, no better than
// provider order: relevance carried 0.45 while every MusicBrainz match ties at
// 100, and the one reliable signal carried 0.10. Tuning against the benchmark
// took top-1 to 75%.
describe('weights reflect what the benchmark measured', () => {
    it('weights confidence above provider relevance', () => {
        expect(RANKING_WEIGHTS.confidence).toBeGreaterThan(RANKING_WEIGHTS.relevance);
    });

    it('keeps a popularity slot even though no source supplies one yet', () => {
        // MusicBrainz has no popularity, so this contributes nothing today and
        // cannot change ordering. It exists so enrichment has somewhere to go.
        expect(RANKING_WEIGHTS.popularity).toBeGreaterThan(0);
    });
});
