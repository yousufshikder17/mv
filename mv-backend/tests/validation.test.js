import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    api,
    createMovie,
    createSchema,
    registerUser,
    resetTables,
} from './helpers/harness.js';

beforeAll(createSchema);
beforeEach(resetTables);

const GOOD = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse-battery',
};

const registerWith = (overrides) =>
    api().post('/auth/register').send({ ...GOOD, ...overrides });

describe('register schema', () => {
    it.each([
        ['a missing name', { name: undefined }],
        ['an empty name', { name: '' }],
        ['a malformed email', { email: 'not-an-email' }],
        ['a missing email', { email: undefined }],
        ['a password under 8 characters', { password: 'short' }],
        ['a missing password', { password: undefined }],
    ])('rejects %s', async (_label, overrides) => {
        const res = await registerWith(overrides);
        expect(res.status).toBe(400);
    });

    it('accepts a password of exactly 8 characters', async () => {
        const res = await registerWith({ password: '12345678' });
        expect(res.status).toBe(201);
    });

    it('reports every problem at once rather than the first', async () => {
        const res = await registerWith({ name: '', email: 'nope', password: 'x' });

        expect(res.status).toBe(400);
        expect(res.body.message.split(',').length).toBeGreaterThanOrEqual(3);
    });

    it('strips unknown fields instead of persisting them', async () => {
        const res = await registerWith({ role: 'admin', id: crypto.randomUUID() });

        expect(res.status).toBe(201);
        expect(res.body.user.role).toBeUndefined();
    });

    it('rejects a body that is not an object', async () => {
        const res = await api()
            .post('/auth/register')
            .set('Content-Type', 'application/json')
            .send('"just a string"');

        expect(res.status).toBe(400);
    });
});

describe('login schema', () => {
    it.each([
        ['a malformed email', { email: 'not-an-email', password: 'whatever' }],
        ['an empty password', { email: GOOD.email, password: '' }],
        ['an empty body', {}],
    ])('rejects %s', async (_label, body) => {
        const res = await api().post('/auth/login').send(body);
        expect(res.status).toBe(400);
    });
});

describe('add-to-watchlist schema', () => {
    const post = async (body) => {
        const user = await registerUser();
        return user.auth(api().post('/watchlist')).send(body);
    };

    it('rejects a movieId that is not a uuid', async () => {
        const res = await post({ movieId: 'not-a-uuid' });
        expect(res.status).toBe(400);
    });

    it('rejects a missing movieId', async () => {
        const res = await post({ status: 'PLANNED' });
        expect(res.status).toBe(400);
    });

    it('rejects a status outside the enum', async () => {
        const res = await post({ movieId: crypto.randomUUID(), status: 'ABANDONED' });
        expect(res.status).toBe(400);
    });

    it.each([
        ['zero', 0],
        ['eleven', 11],
        ['negative', -3],
        ['fractional', 2.5],
    ])('rejects a rating of %s', async (_label, rating) => {
        const res = await post({ movieId: crypto.randomUUID(), rating });
        expect(res.status).toBe(400);
    });

    it.each([1, 10])('accepts a rating of %i', async (rating) => {
        const user = await registerUser();
        const film = await createMovie();
        const res = await user
            .auth(api().post('/watchlist'))
            .send({ movieId: film.id, rating });

        expect(res.status).toBe(201);
    });
});

describe('update-watchlist schema', () => {
    // PUT /watchlist/:id had no validateRequest at all, so anything the
    // database happened to accept went straight through: a rating of 999, a
    // note of arbitrary length. The column types were the only check, and they
    // do not encode the 1-10 range the add endpoint enforces.
    const owned = async () => {
        const user = await registerUser();
        const film = await createMovie();
        const created = await user
            .auth(api().post('/watchlist'))
            .send({ movieId: film.id });
        return { user, itemId: created.body.data.watchlistItem.id };
    };

    it.each([
        ['a rating above 10', { rating: 999 }],
        ['a rating of zero', { rating: 0 }],
        ['a fractional rating', { rating: 4.5 }],
        ['a status outside the enum', { status: 'ABANDONED' }],
    ])('rejects %s', async (_label, body) => {
        const { user, itemId } = await owned();
        const res = await user.auth(api().put(`/watchlist/${itemId}`)).send(body);

        expect(res.status).toBe(400);
    });

    it('applies the same 1-10 bound the add endpoint uses', async () => {
        const { user, itemId } = await owned();
        const res = await user.auth(api().put(`/watchlist/${itemId}`)).send({ rating: 10 });

        expect(res.status).toBe(200);
        expect(res.body.data.watchlistItem.rating).toBe(10);
    });

    it('still allows clearing notes', async () => {
        const { user, itemId } = await owned();
        const res = await user.auth(api().put(`/watchlist/${itemId}`)).send({ notes: '' });

        expect(res.status).toBe(200);
    });

    it('ignores an attempt to move the item to another user', async () => {
        const { user, itemId } = await owned();
        const victim = await registerUser();

        await user
            .auth(api().put(`/watchlist/${itemId}`))
            .send({ userId: victim.id, status: 'COMPLETED' });

        const theirs = await victim.auth(api().get('/watchlist'));
        expect(theirs.body.results).toBe(0);
    });
});

describe('movie import schema', () => {
    const post = async (body) => {
        const user = await registerUser();
        return user.auth(api().post('/movies/import')).send(body);
    };

    it.each([
        ['a non-numeric tmdbId', { tmdbId: 'abc' }],
        ['a negative tmdbId', { tmdbId: -1 }],
        ['a missing tmdbId', {}],
    ])('rejects %s', async (_label, body) => {
        const res = await post(body);
        expect(res.status).toBe(400);
    });
});

describe('malformed ids in the path', () => {
    it('answers a non-uuid watchlist id with a client error, not a 500', async () => {
        // Postgres raises 22P02 for a bad uuid; errorMiddleware maps it to 400.
        // The mapping existed but tested err.code, while drizzle puts the
        // SQLSTATE on err.cause.code — so it never fired and this was a 500.
        const user = await registerUser();
        const res = await user.auth(api().delete('/watchlist/not-a-uuid'));

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid ID format provided.');
    });

    it('never returns the failed SQL or its bound parameters', async () => {
        // Drizzle's message embeds the query and the values bound to it. The
        // 500 for a malformed uuid was shipping the whole delete statement,
        // the column list, and the caller's own user id.
        const user = await registerUser();

        for (const res of [
            await user.auth(api().delete('/watchlist/not-a-uuid')),
            await user.auth(api().put('/watchlist/not-a-uuid')).send({ rating: 5 }),
        ]) {
            const body = JSON.stringify(res.body).toLowerCase();
            expect(body).not.toContain('failed query');
            expect(body).not.toContain('params:');
            expect(body).not.toContain('watchlist_item');
            expect(body).not.toContain(user.id.toLowerCase());
        }
    });
});
