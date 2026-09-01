import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';
import { clearCache } from '../src/utils/cache.js';

beforeAll(createSchema);
beforeEach(resetTables);

const makeList = async (user, body = {}) => {
    const res = await user.auth(api().post('/lists')).send({ name: 'Best of 2026', ...body });
    return res.body.data.list;
};

const addTo = async (user, list, media, note) => {
    const res = await user.auth(api().post(`/lists/${list.id}/items`))
        .send({ mediaItemId: media.id, ...(note ? { note } : {}) });
    return res.body.data?.item;
};

const titlesIn = async (list, user = null) => {
    const req = api().get(`/lists/${list.id}`);
    const res = await (user ? user.auth(req) : req);
    return (res.body.data?.items ?? []).map((i) => i.movie.title);
};

describe('lists are curation, not tracking', () => {
    it('holds things you have never tracked', async () => {
        // The whole reason list_item points at media_item rather than
        // tracking_item: "films to show my brother" must not require claiming
        // to have watched them.
        const user = await registerUser();
        const list = await makeList(user);
        const film = await createMovie({ title: 'Unseen' });

        const res = await user.auth(api().post(`/lists/${list.id}/items`)).send({ mediaItemId: film.id });

        expect(res.status).toBe(201);
        expect((await user.auth(api().get('/watchlist'))).body.results).toBe(0);
    });

    it('holds one thing in many lists', async () => {
        const user = await registerUser();
        const film = await createMovie({ title: 'Dune' });
        const a = await makeList(user, { name: 'Sci-fi' });
        const b = await makeList(user, { name: 'Rewatches' });

        await addTo(user, a, film);
        await addTo(user, b, film);

        expect(await titlesIn(a, user)).toEqual(['Dune']);
        expect(await titlesIn(b, user)).toEqual(['Dune']);
    });

    it('refuses the same thing twice in one list', async () => {
        const user = await registerUser();
        const list = await makeList(user);
        const film = await createMovie();
        await addTo(user, list, film);

        const res = await user.auth(api().post(`/lists/${list.id}/items`)).send({ mediaItemId: film.id });
        expect(res.status).toBe(409);
    });

    it('refuses two lists with the same name', async () => {
        const user = await registerUser();
        await makeList(user, { name: 'Favourites' });

        const res = await user.auth(api().post('/lists')).send({ name: 'Favourites' });
        expect(res.status).toBe(409);
    });

    it('lets two different people use the same list name', async () => {
        const alice = await registerUser();
        const bob = await registerUser();
        await makeList(alice, { name: 'Favourites' });

        const res = await bob.auth(api().post('/lists')).send({ name: 'Favourites' });
        expect(res.status).toBe(201);
    });
});

// SPEC 9's third privacy layer, which M8 had to defer: there was no list
// object to hang the flag on until now.
describe('per-list privacy', () => {
    it('is private by default', async () => {
        // A list is a draft far more often than a publication.
        const user = await registerUser();
        const list = await makeList(user);

        expect(list.isPublic).toBe(false);
        expect((await api().get(`/lists/${list.id}`)).status).toBe(404);
    });

    it('is readable by anyone once published', async () => {
        const user = await registerUser();
        const list = await makeList(user, { isPublic: true });
        await addTo(user, list, await createMovie({ title: 'Dune' }));

        const res = await api().get(`/lists/${list.id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.items[0].movie.title).toBe('Dune');
        expect(res.body.data.list.owner.name).toBe(user.name);
    });

    it('answers 404 rather than 403 for a private list', async () => {
        // A different answer confirms the list exists, which is the one thing
        // its owner did not agree to.
        const owner = await registerUser();
        const stranger = await registerUser();
        const list = await makeList(owner);

        expect((await stranger.auth(api().get(`/lists/${list.id}`))).status).toBe(404);
    });

    it('shows the owner their own private list', async () => {
        const user = await registerUser();
        const list = await makeList(user);

        const res = await user.auth(api().get(`/lists/${list.id}`));
        expect(res.status).toBe(200);
        expect(res.body.data.list.isOwner).toBe(true);
    });

    it('hides a public list when the profile goes private', async () => {
        // The outer gate wins. Making a profile private is the setting people
        // reach for when they want to disappear, and it must not leave public
        // lists behind as a side door.
        const user = await registerUser();
        const list = await makeList(user, { isPublic: true });
        expect((await api().get(`/lists/${list.id}`)).status).toBe(200);

        await user.auth(api().patch('/account/privacy')).send({ profilePublic: false });

        expect((await api().get(`/lists/${list.id}`)).status).toBe(404);
    });

    it('shows only public lists on someone else profile', async () => {
        const owner = await registerUser();
        await makeList(owner, { name: 'Shown', isPublic: true });
        await makeList(owner, { name: 'Secret' });

        const seen = await api().get(`/social/profile/${owner.id}/lists`);
        expect(seen.body.data.lists.map((l) => l.name)).toEqual(['Shown']);

        const own = await owner.auth(api().get('/lists'));
        expect(own.body.results).toBe(2);
    });
});

describe('who may change a list', () => {
    it('refuses edits, deletes and additions from anyone else', async () => {
        const owner = await registerUser();
        const mallory = await registerUser();
        const list = await makeList(owner, { isPublic: true });
        const film = await createMovie();

        expect((await mallory.auth(api().patch(`/lists/${list.id}`)).send({ name: 'Mine now' })).status).toBe(404);
        expect((await mallory.auth(api().post(`/lists/${list.id}/items`)).send({ mediaItemId: film.id })).status).toBe(404);
        expect((await mallory.auth(api().delete(`/lists/${list.id}`))).status).toBe(404);

        // Still intact and still the owner's.
        expect((await api().get(`/lists/${list.id}`)).body.data.list.name).toBe('Best of 2026');
    });

    it('requires an account to create one', async () => {
        expect((await api().post('/lists').send({ name: 'x' })).status).toBe(401);
    });

    it('takes its items with it when deleted', async () => {
        const user = await registerUser();
        const list = await makeList(user);
        await addTo(user, list, await createMovie());

        await user.auth(api().delete(`/lists/${list.id}`));

        expect((await user.auth(api().get(`/lists/${list.id}`))).status).toBe(404);

        // The catalogue row is shared and must survive the list that
        // referenced it. Cache cleared first - variety is cached for ten
        // minutes, and a stale hit here would assert nothing.
        clearCache();
        expect((await api().get('/movies/variety')).body.results).toBe(1);
    });
});

describe('ordering', () => {
    it('appends new items to the end', async () => {
        const user = await registerUser();
        const list = await makeList(user);
        for (const t of ['First', 'Second', 'Third']) {
            await addTo(user, list, await createMovie({ title: t }));
        }

        expect(await titlesIn(list, user)).toEqual(['First', 'Second', 'Third']);
    });

    it('moves an item to the front', async () => {
        const user = await registerUser();
        const list = await makeList(user);
        const items = [];
        for (const t of ['First', 'Second', 'Third']) {
            items.push(await addTo(user, list, await createMovie({ title: t })));
        }

        await user.auth(api().patch(`/lists/${list.id}/items/${items[2].id}`)).send({ moveAfter: null });

        expect(await titlesIn(list, user)).toEqual(['Third', 'First', 'Second']);
    });

    it('moves an item between two others', async () => {
        const user = await registerUser();
        const list = await makeList(user);
        const items = [];
        for (const t of ['First', 'Second', 'Third']) {
            items.push(await addTo(user, list, await createMovie({ title: t })));
        }

        // Third sits behind First.
        await user.auth(api().patch(`/lists/${list.id}/items/${items[2].id}`))
            .send({ moveAfter: items[0].id });

        expect(await titlesIn(list, user)).toEqual(['First', 'Third', 'Second']);
    });

    it('survives repeated moves into the same gap', async () => {
        // Sparse positions eventually run out of room between two neighbours.
        // The order has to stay stable when they do, which is what the
        // renumbering is for.
        const user = await registerUser();
        const list = await makeList(user);
        const items = [];
        for (const t of ['A', 'B', 'C', 'D']) {
            items.push(await addTo(user, list, await createMovie({ title: t })));
        }

        for (let i = 0; i < 12; i++) {
            await user.auth(api().patch(`/lists/${list.id}/items/${items[3].id}`))
                .send({ moveAfter: items[0].id });
            await user.auth(api().patch(`/lists/${list.id}/items/${items[2].id}`))
                .send({ moveAfter: items[0].id });
        }

        const titles = await titlesIn(list, user);
        expect(titles).toHaveLength(4);
        expect(new Set(titles)).toEqual(new Set(['A', 'B', 'C', 'D']));
        expect(titles[0]).toBe('A');
    });

    it('refuses an anchor from another list', async () => {
        const user = await registerUser();
        const a = await makeList(user, { name: 'A' });
        const b = await makeList(user, { name: 'B' });
        const inA = await addTo(user, a, await createMovie());
        const inB = await addTo(user, b, await createMovie());

        const res = await user.auth(api().patch(`/lists/${a.id}/items/${inA.id}`))
            .send({ moveAfter: inB.id });
        expect(res.status).toBe(404);
    });
});

describe('notes and validation', () => {
    it('keeps a note explaining why something is here', async () => {
        const user = await registerUser();
        const list = await makeList(user, { isPublic: true });
        await addTo(user, list, await createMovie({ title: 'Dune' }), 'For the sound design alone.');

        const res = await api().get(`/lists/${list.id}`);
        expect(res.body.data.items[0].note).toBe('For the sound design alone.');
    });

    it('refuses an empty name and an overlong one', async () => {
        const user = await registerUser();
        expect((await user.auth(api().post('/lists')).send({ name: '   ' })).status).toBe(400);
        expect((await user.auth(api().post('/lists')).send({ name: 'x'.repeat(81) })).status).toBe(400);
    });

    it('refuses an item that does not exist', async () => {
        const user = await registerUser();
        const list = await makeList(user);

        const res = await user.auth(api().post(`/lists/${list.id}/items`))
            .send({ mediaItemId: '00000000-0000-4000-8000-000000000000' });
        expect(res.status).toBe(404);
    });

    it('rejects an update that changes nothing', async () => {
        const user = await registerUser();
        const list = await makeList(user);
        expect((await user.auth(api().patch(`/lists/${list.id}`)).send({})).status).toBe(400);
    });
});

describe('the GDPR export', () => {
    it('carries lists with their contents, not just their names', async () => {
        // A list without its items is not the thing the person made.
        const user = await registerUser();
        const list = await makeList(user, { name: 'Best of 2026' });
        await addTo(user, list, await createMovie({ title: 'Dune' }), 'Why it is here');

        const res = await user.auth(api().get('/account/export'));

        expect(res.body.lists).toHaveLength(1);
        expect(res.body.lists[0].name).toBe('Best of 2026');
        expect(res.body.lists[0].items[0].note).toBe('Why it is here');
        expect(res.body.lists[0].items[0].item.title).toBe('Dune');
    });
});
