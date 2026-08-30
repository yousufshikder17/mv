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

/** Two users and a film each has added. The shape most of these tests need. */
const twoUsersWithItems = async () => {
    const [alice, bob] = [await registerUser(), await registerUser()];
    const [filmA, filmB] = [await createMovie(), await createMovie()];

    const aliceItem = await alice
        .auth(api().post('/watchlist'))
        .send({ movieId: filmA.id, status: 'PLANNED', notes: 'alice note' });
    const bobItem = await bob
        .auth(api().post('/watchlist'))
        .send({ movieId: filmB.id, status: 'WATCHING', notes: 'bob note' });

    return {
        alice,
        bob,
        aliceItemId: aliceItem.body.data.watchlistItem.id,
        bobItemId: bobItem.body.data.watchlistItem.id,
        filmA,
        filmB,
    };
};

describe('reading', () => {
    it('returns only the requesting user’s items', async () => {
        const { alice, aliceItemId, bobItemId } = await twoUsersWithItems();

        const res = await alice.auth(api().get('/watchlist'));
        const ids = res.body.data.watchlist.map((i) => i.id);

        expect(ids).toContain(aliceItemId);
        expect(ids).not.toContain(bobItemId);
        expect(res.body.results).toBe(1);
    });

    it('shows a new user an empty list rather than everyone’s', async () => {
        await twoUsersWithItems();
        const carol = await registerUser();

        const res = await carol.auth(api().get('/watchlist'));

        expect(res.body.results).toBe(0);
        expect(res.body.data.watchlist).toEqual([]);
    });
});

describe('deleting someone else’s item', () => {
    it('is refused', async () => {
        const { alice, bobItemId } = await twoUsersWithItems();

        const res = await alice.auth(api().delete(`/watchlist/${bobItemId}`));

        expect(res.status).toBe(404);
    });

    it('leaves the item intact', async () => {
        // A 404 that still deleted the row would pass the check above.
        const { alice, bob, bobItemId } = await twoUsersWithItems();

        await alice.auth(api().delete(`/watchlist/${bobItemId}`));
        const after = await bob.auth(api().get('/watchlist'));

        expect(after.body.data.watchlist.map((i) => i.id)).toContain(bobItemId);
    });
});

describe('updating someone else’s item', () => {
    it('is refused', async () => {
        const { alice, bobItemId } = await twoUsersWithItems();

        const res = await alice
            .auth(api().put(`/watchlist/${bobItemId}`))
            .send({ status: 'DROPPED' });

        expect(res.status).toBe(404);
    });

    it('leaves the item unmodified', async () => {
        const { alice, bob, bobItemId } = await twoUsersWithItems();

        await alice
            .auth(api().put(`/watchlist/${bobItemId}`))
            .send({ status: 'DROPPED', rating: 1, notes: 'vandalised' });

        const after = await bob.auth(api().get('/watchlist'));
        const item = after.body.data.watchlist.find((i) => i.id === bobItemId);

        expect(item.status).toBe('WATCHING');
        expect(item.notes).toBe('bob note');
        expect(item.rating).toBeNull();
    });
});

describe('adding', () => {
    it('ignores a userId supplied in the body', async () => {
        // The classic IDOR: identity must come from the verified token, never
        // from something the caller can type.
        const alice = await registerUser();
        const bob = await registerUser();
        const film = await createMovie();

        await alice
            .auth(api().post('/watchlist'))
            .send({ movieId: film.id, userId: bob.id });

        const bobList = await bob.auth(api().get('/watchlist'));
        const aliceList = await alice.auth(api().get('/watchlist'));

        expect(bobList.body.results).toBe(0);
        expect(aliceList.body.results).toBe(1);
    });

    it('lets two users hold the same film independently', async () => {
        // The shared tmdbId-keyed catalogue depends on this working.
        const alice = await registerUser();
        const bob = await registerUser();
        const film = await createMovie();

        const first = await alice.auth(api().post('/watchlist')).send({ movieId: film.id });
        const second = await bob.auth(api().post('/watchlist')).send({ movieId: film.id });

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
    });

    it('refuses the same film twice for one user', async () => {
        const alice = await registerUser();
        const film = await createMovie();

        await alice.auth(api().post('/watchlist')).send({ movieId: film.id });
        const again = await alice.auth(api().post('/watchlist')).send({ movieId: film.id });

        expect(again.status).toBe(400);
    });

    it('refuses a film that does not exist', async () => {
        const alice = await registerUser();
        const res = await alice
            .auth(api().post('/watchlist'))
            .send({ movieId: crypto.randomUUID() });

        expect(res.status).toBe(404);
    });
});

describe('own items', () => {
    it('can be updated by their owner', async () => {
        const { alice, aliceItemId } = await twoUsersWithItems();

        const res = await alice
            .auth(api().put(`/watchlist/${aliceItemId}`))
            .send({ status: 'COMPLETED', rating: 9 });

        expect(res.status).toBe(200);
        expect(res.body.data.watchlistItem.status).toBe('COMPLETED');
        expect(res.body.data.watchlistItem.rating).toBe(9);
    });

    it('can be deleted by their owner', async () => {
        const { alice, aliceItemId } = await twoUsersWithItems();

        const res = await alice.auth(api().delete(`/watchlist/${aliceItemId}`));
        const after = await alice.auth(api().get('/watchlist'));

        expect(res.status).toBe(200);
        expect(after.body.results).toBe(0);
    });

    it('can have their notes cleared', async () => {
        // Clearing is a spread over a falsy check away from being impossible:
        // `...(notes && { notes })` drops an empty string, so the old note
        // survives a request that explicitly asked to remove it.
        const { alice, aliceItemId } = await twoUsersWithItems();

        await alice.auth(api().put(`/watchlist/${aliceItemId}`)).send({ notes: '' });

        const after = await alice.auth(api().get('/watchlist'));
        const item = after.body.data.watchlist.find((i) => i.id === aliceItemId);

        expect(item.notes).toBe('');
    });
});
