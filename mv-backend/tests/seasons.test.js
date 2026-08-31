import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';

beforeAll(createSchema);
beforeEach(resetTables);

/** A tracked show belonging to a fresh user. */
const trackedShow = async () => {
    const user = await registerUser();
    const show = await createMovie({ type: 'tv', title: 'Severance', seasonCount: 3, episodeCount: 19 });
    const res = await user.auth(api().post('/watchlist')).send({ movieId: show.id });
    return { user, show, itemId: res.body.data.watchlistItem.id };
};

describe('season ratings', () => {
    it('records a rating for one season', async () => {
        const { user, itemId } = await trackedShow();

        const res = await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: 8.5 });

        expect(res.status).toBe(200);
        expect(res.body.data.season).toMatchObject({ seasonNumber: 1, rating: 8.5 });
    });

    it('returns the rating as a number, not a string', async () => {
        // Postgres numeric arrives as a string by default; without mode:'number'
        // the API would answer "8.5" and every comparison downstream would be
        // a string comparison.
        const { user, itemId } = await trackedShow();
        await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: 8.5 });

        const res = await user.auth(api().get(`/watchlist/${itemId}/seasons`));
        expect(typeof res.body.data.seasons[0].rating).toBe('number');
    });

    it('upserts rather than duplicating when a season is rated twice', async () => {
        const { user, itemId } = await trackedShow();
        await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: 6 });
        await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: 9 });

        const res = await user.auth(api().get(`/watchlist/${itemId}/seasons`));
        expect(res.body.results).toBe(1);
        expect(res.body.data.seasons[0].rating).toBe(9);
    });

    it('keeps seasons separate and ordered', async () => {
        const { user, itemId } = await trackedShow();
        await user.auth(api().put(`/watchlist/${itemId}/seasons/2`)).send({ rating: 7 });
        await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: 9 });

        const res = await user.auth(api().get(`/watchlist/${itemId}/seasons`));
        expect(res.body.data.seasons.map((s) => s.seasonNumber)).toEqual([1, 2]);
    });

    it('refuses seasons on a film — only TV has them', async () => {
        const user = await registerUser();
        const film = await createMovie({ type: 'film' });
        const added = await user.auth(api().post('/watchlist')).send({ movieId: film.id });

        const res = await user
            .auth(api().put(`/watchlist/${added.body.data.watchlistItem.id}/seasons/1`))
            .send({ rating: 8 });

        expect(res.status).toBe(400);
    });

    it('applies the same 1-10 half-step bound as the item rating', async () => {
        const { user, itemId } = await trackedShow();
        for (const rating of [0, 10.5, 7.3]) {
            const res = await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating });
            expect(res.status).toBe(400);
        }
    });

    it('lets a rating be cleared back to unrated', async () => {
        const { user, itemId } = await trackedShow();
        await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: 8 });

        const res = await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: null });
        expect(res.body.data.season.rating).toBeNull();
    });
});

describe('season ownership', () => {
    it("refuses to rate a season of someone else's item", async () => {
        const { itemId } = await trackedShow();
        const mallory = await registerUser();

        const res = await mallory.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: 1 });

        // 404, not 403: a different answer would confirm the row exists.
        expect(res.status).toBe(404);
    });

    it("refuses to read someone else's season ratings", async () => {
        const { user, itemId } = await trackedShow();
        await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: 8 });
        const mallory = await registerUser();

        const res = await mallory.auth(api().get(`/watchlist/${itemId}/seasons`));
        expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
        const { itemId } = await trackedShow();
        expect((await api().get(`/watchlist/${itemId}/seasons`)).status).toBe(401);
    });

    it('deletes season ratings with the tracking item', async () => {
        const { user, itemId } = await trackedShow();
        await user.auth(api().put(`/watchlist/${itemId}/seasons/1`)).send({ rating: 8 });

        await user.auth(api().delete(`/watchlist/${itemId}`));

        // ON DELETE CASCADE — an orphaned season rating would be unreachable
        // and would still count in any later aggregate.
        const res = await user.auth(api().get(`/watchlist/${itemId}/seasons`));
        expect(res.status).toBe(404);
    });
});
