import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';

beforeAll(createSchema);
beforeEach(resetTables);

const tracked = async (type = 'tv') => {
    const user = await registerUser();
    const media = await createMovie({ type, seasonCount: 3, episodeCount: 19 });
    const res = await user.auth(api().post('/watchlist')).send({ movieId: media.id });
    return { user, media, itemId: res.body.data.watchlistItem.id };
};

// These exist because the progress fields were validated and then silently
// dropped by the update handler: Zod accepted them, the handler never spread
// them into the SET, and the API answered 200 with the old values. A schema
// test alone would have passed.
describe('progress is actually persisted', () => {
    it('writes season, episode and total', async () => {
        const { user, itemId } = await tracked();

        const res = await user.auth(api().put(`/watchlist/${itemId}`))
            .send({ progressSeason: 2, progressCurrent: 4, progressTotal: 10 });

        expect(res.status).toBe(200);
        expect(res.body.data.watchlistItem).toMatchObject({
            progressSeason: 2, progressCurrent: 4, progressTotal: 10,
        });
    });

    it('survives a reload rather than only echoing the request back', async () => {
        const { user, itemId } = await tracked();
        await user.auth(api().put(`/watchlist/${itemId}`)).send({ progressSeason: 3, progressCurrent: 1 });

        const list = await user.auth(api().get('/watchlist'));
        const item = list.body.data.watchlist.find((i) => i.id === itemId);
        expect(item).toMatchObject({ progressSeason: 3, progressCurrent: 1 });
    });

    it('clears a field back to null', async () => {
        const { user, itemId } = await tracked();
        await user.auth(api().put(`/watchlist/${itemId}`)).send({ progressCurrent: 7 });

        const res = await user.auth(api().put(`/watchlist/${itemId}`)).send({ progressCurrent: null });
        expect(res.body.data.watchlistItem.progressCurrent).toBeNull();
    });

    it('leaves untouched fields alone', async () => {
        // Only what is sent may change - a partial update must not blank the rest.
        const { user, itemId } = await tracked();
        await user.auth(api().put(`/watchlist/${itemId}`))
            .send({ progressSeason: 2, progressCurrent: 4, progressTotal: 10, rating: 8 });

        const res = await user.auth(api().put(`/watchlist/${itemId}`)).send({ progressCurrent: 5 });
        expect(res.body.data.watchlistItem).toMatchObject({
            progressSeason: 2, progressCurrent: 5, progressTotal: 10, rating: 8,
        });
    });

    it('rejects negative progress', async () => {
        const { user, itemId } = await tracked();
        const res = await user.auth(api().put(`/watchlist/${itemId}`)).send({ progressCurrent: -1 });
        expect(res.status).toBe(400);
    });

    it('accepts progress on add, not only on update', async () => {
        const user = await registerUser();
        const media = await createMovie({ type: 'tv' });

        const res = await user.auth(api().post('/watchlist'))
            .send({ movieId: media.id, progressSeason: 1, progressCurrent: 2 });

        expect(res.status).toBe(201);
    });
});

describe('half-step ratings', () => {
    it('stores and returns 8.5 as a number', async () => {
        const { user, itemId } = await tracked();
        const res = await user.auth(api().put(`/watchlist/${itemId}`)).send({ rating: 8.5 });

        expect(res.body.data.watchlistItem.rating).toBe(8.5);
        expect(typeof res.body.data.watchlistItem.rating).toBe('number');
    });

    it('survives a reload as a number, not a string', async () => {
        const { user, itemId } = await tracked();
        await user.auth(api().put(`/watchlist/${itemId}`)).send({ rating: 3.5 });

        const list = await user.auth(api().get('/watchlist'));
        expect(list.body.data.watchlist.find((i) => i.id === itemId).rating).toBe(3.5);
    });

    it('rejects anything off the half step', async () => {
        const { user, itemId } = await tracked();
        for (const rating of [7.3, 0.5, 10.5]) {
            expect((await user.auth(api().put(`/watchlist/${itemId}`)).send({ rating })).status).toBe(400);
        }
    });
});
