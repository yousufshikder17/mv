import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from '../src/config/db.js';
import { trackingItems } from '../src/db/schema.js';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';
import { recommendFor, tasteProfile } from '../src/services/recommendService.js';

beforeAll(createSchema);
beforeEach(resetTables);

const track = (userId, mediaItemId, status = 'COMPLETED', rating = null) =>
    db.insert(trackingItems).values({ userId, mediaItemId, status, rating });

// SPEC 9 requires recommendations to always show why. That requirement is the
// reason this is similarity scoring rather than a model: a system that cannot
// explain itself fails it however good its guesses are.
describe('every recommendation carries a reason', () => {
    it('names the genres that caused the match', async () => {
        const user = await registerUser();
        const liked = await createMovie({ title: 'Dune', genres: ['Science Fiction', 'Adventure'] });
        await createMovie({ title: 'Arrival', genres: ['Science Fiction', 'Drama'] });
        await track(user.id, liked.id, 'COMPLETED', 9);

        const { recommendations } = await recommendFor(user.id);

        expect(recommendations.length).toBeGreaterThan(0);
        expect(recommendations[0].why).toContain('Science Fiction');
        expect(recommendations[0].matchedGenres).toContain('Science Fiction');
    });

    it('says plainly when there is not enough signal yet', async () => {
        // A new account. Silence with no explanation is worse than the truth.
        const user = await registerUser();
        const { recommendations, reason } = await recommendFor(user.id);
        expect(recommendations).toHaveLength(0);
        expect(reason).toBe('not_enough_signal');
    });
});

describe('what counts as taste', () => {
    it('ignores PLANNED, which means untested rather than liked', async () => {
        const user = await registerUser();
        const planned = await createMovie({ genres: ['Horror'] });
        await createMovie({ genres: ['Horror'] });
        await track(user.id, planned.id, 'PLANNED');

        const { reason } = await recommendFor(user.id);
        expect(reason).toBe('not_enough_signal');
    });

    it('ignores DROPPED, which is a negative signal', async () => {
        const user = await registerUser();
        const dropped = await createMovie({ genres: ['Horror'] });
        await createMovie({ genres: ['Horror'] });
        await track(user.id, dropped.id, 'DROPPED', 2);

        const { reason } = await recommendFor(user.id);
        expect(reason).toBe('not_enough_signal');
    });

    it('weights a 9 more heavily than a 7', async () => {
        const user = await registerUser();
        const loved = await createMovie({ genres: ['Noir'] });
        const liked = await createMovie({ genres: ['Comedy'] });
        const noir = await createMovie({ title: 'Noir candidate', genres: ['Noir'] });
        await createMovie({ title: 'Comedy candidate', genres: ['Comedy'] });
        await track(user.id, loved.id, 'COMPLETED', 10);
        await track(user.id, liked.id, 'COMPLETED', 7);

        const { recommendations } = await recommendFor(user.id);
        expect(recommendations[0].item.id).toBe(noir.id);
    });

    it('never recommends something already tracked', async () => {
        const user = await registerUser();
        const seen = await createMovie({ genres: ['Drama'] });
        await track(user.id, seen.id, 'COMPLETED', 9);

        const { recommendations } = await recommendFor(user.id);
        expect(recommendations.map((r) => r.item.id)).not.toContain(seen.id);
    });

    it('recommends across media types, which is the point of one catalogue', async () => {
        const user = await registerUser();
        const film = await createMovie({ type: 'film', genres: ['Fantasy'] });
        const game = await createMovie({ type: 'game', source: 'rawg', genres: ['Fantasy'] });
        await track(user.id, film.id, 'COMPLETED', 9);

        const { recommendations } = await recommendFor(user.id);
        expect(recommendations.map((r) => r.item.id)).toContain(game.id);
    });
});

// SPEC 3: Spotify's terms forbid their content being used in recommendation
// systems or ML. Enforced on the source, not hoped for.
describe('Spotify data is excluded by licence', () => {
    it('never recommends a Spotify-sourced item', async () => {
        const user = await registerUser();
        const liked = await createMovie({ genres: ['Ambient'] });
        await createMovie({ type: 'album', source: 'spotify', genres: ['Ambient'] });
        await track(user.id, liked.id, 'COMPLETED', 9);

        const { recommendations } = await recommendFor(user.id);
        expect(recommendations.every((r) => r.item.source !== 'spotify')).toBe(true);
    });

    it('never learns taste FROM a Spotify item either', async () => {
        // Excluding it from output but training on it would still be using
        // their content to build a recommendation system.
        const user = await registerUser();
        const album = await createMovie({ type: 'album', source: 'spotify', genres: ['Ambient'] });
        await createMovie({ genres: ['Ambient'] });
        await track(user.id, album.id, 'COLLECTED', 10);

        const { genres } = await tasteProfile(user.id);
        expect(genres.has('ambient')).toBe(false);
    });
});

// The payoff of choosing MusicBrainz over Spotify. SPEC 3 excluded music from
// recommendations because Spotify's terms forbid it; MusicBrainz core data is
// CC0, so that exclusion simply does not apply.
describe('MusicBrainz albums ARE recommendable', () => {
    it('recommends an album sourced from MusicBrainz', async () => {
        const user = await registerUser();
        const liked = await createMovie({ type: 'album', source: 'musicbrainz', genres: ['Shoegaze'] });
        const candidate = await createMovie({ type: 'album', source: 'musicbrainz', genres: ['Shoegaze'] });
        await track(user.id, liked.id, 'COLLECTED', 9);

        const { recommendations } = await recommendFor(user.id);
        expect(recommendations.map((r) => r.item.id)).toContain(candidate.id);
    });

    it('learns taste from a MusicBrainz album', async () => {
        const user = await registerUser();
        const album = await createMovie({ type: 'album', source: 'musicbrainz', genres: ['Shoegaze'] });
        await track(user.id, album.id, 'COLLECTED', 10);

        const { genres } = await tasteProfile(user.id);
        expect(genres.has('shoegaze')).toBe(true);
    });

    it('still excludes Spotify, if a Spotify row ever exists', async () => {
        // The exclusion is on the source, so it holds regardless of type.
        const user = await registerUser();
        const liked = await createMovie({ type: 'album', source: 'musicbrainz', genres: ['Ambient'] });
        await createMovie({ type: 'album', source: 'spotify', genres: ['Ambient'] });
        await track(user.id, liked.id, 'COLLECTED', 9);

        const { recommendations } = await recommendFor(user.id);
        expect(recommendations.every((r) => r.item.source !== 'spotify')).toBe(true);
    });
});

describe('the endpoint', () => {
    it('returns recommendations with their reasons', async () => {
        const user = await registerUser();
        const liked = await createMovie({ genres: ['Thriller'] });
        await createMovie({ genres: ['Thriller'] });
        await track(user.id, liked.id, 'COMPLETED', 9);

        const res = await user.auth(api().get('/recommendations'));
        expect(res.status).toBe(200);
        expect(res.body.data.recommendations[0].why).toBeTruthy();
    });

    it('requires an account, since it is built from your own list', async () => {
        expect((await api().get('/recommendations')).status).toBe(401);
    });
});
