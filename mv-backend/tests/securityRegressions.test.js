import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';
import { clearCache } from '../src/utils/cache.js';

beforeAll(createSchema);
beforeEach(async () => { await resetTables(); clearCache(); });
afterEach(() => vi.unstubAllGlobals());

const track = async (user, media, over = {}) => {
    const res = await user.auth(api().post('/watchlist')).send({ movieId: media.id });
    const id = res.body.data.watchlistItem.id;
    if (Object.keys(over).length) await user.auth(api().put('/watchlist/' + id)).send(over);
    return id;
};

// Found in review: GET /social/profile/:userId/items selected the whole
// tracking_item row, so `notes` shipped to anyone. The schema calls them
// "private scratch text" and the privacy page promises they are never public.
describe('private notes never leave the owner', () => {
    it('omits notes from a stranger reading a public profile', async () => {
        const user = await registerUser();
        await track(user, await createMovie(), { notes: 'SECRET-SCRATCH-TEXT' });

        const res = await api().get(`/social/profile/${user.id}/items`);

        expect(res.status).toBe(200);
        expect(res.body.results).toBe(1);
        expect(res.body.data.items[0].notes).toBeUndefined();
        // Belt and braces: the string must not appear anywhere in the payload.
        expect(JSON.stringify(res.body)).not.toContain('SECRET-SCRATCH-TEXT');
    });

    it('omits notes from a signed-in stranger too', async () => {
        const owner = await registerUser();
        const nosy = await registerUser();
        await track(owner, await createMovie(), { notes: 'SECRET-SCRATCH-TEXT' });

        const res = await nosy.auth(api().get(`/social/profile/${owner.id}/items`));

        expect(JSON.stringify(res.body)).not.toContain('SECRET-SCRATCH-TEXT');
    });

    it('still shows the owner their own notes', async () => {
        // The fix must not cost the owner their own data.
        const user = await registerUser();
        await track(user, await createMovie(), { notes: 'SECRET-SCRATCH-TEXT' });

        const res = await user.auth(api().get(`/social/profile/${user.id}/items`));

        expect(res.body.data.items[0].notes).toBe('SECRET-SCRATCH-TEXT');
    });

    it('does not leak the hidden flag or the owner id to strangers', async () => {
        // Neither is theirs to know, and both came along with the whole row.
        const user = await registerUser();
        await track(user, await createMovie());

        const [item] = (await api().get(`/social/profile/${user.id}/items`)).body.data.items;

        expect(item.hidden).toBeUndefined();
        expect(item.userId).toBeUndefined();
        // What a profile IS for still comes through.
        expect(item.status).toBeDefined();
        expect(item.movie.title).toBeDefined();
    });
});

// Found in review: externalId is interpolated into a provider path by every
// adapter, and Express 5 decodes %2F in a route parameter - so a traversal
// sequence could redirect the request to a different endpoint at the same
// provider, reached with our API key.
describe('externalId cannot be steered into another provider path', () => {
    it('refuses traversal sequences rather than calling out with our key', async () => {
        const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
        vi.stubGlobal('fetch', spy);

        for (const bad of ['../../account', '..%2F..%2Faccount', '../../../3/account']) {
            const res = await api().get(`/movies/details/film/${encodeURIComponent(bad)}`);
            expect(res.status, bad).toBe(400);
        }

        // The point of the guard: no outbound request was ever made.
        expect(spy).not.toHaveBeenCalled();
    });

    it('refuses a full URL smuggled in as an id', async () => {
        vi.stubGlobal('fetch', vi.fn());
        const res = await api().get(`/movies/details/film/${encodeURIComponent('https://evil.test/x')}`);
        expect(res.status).toBe(400);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('guards the price route on the same rule', async () => {
        vi.stubGlobal('fetch', vi.fn());
        const res = await api().get(`/movies/prices/game/${encodeURIComponent('../../account')}`);
        expect(res.status).toBe(400);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('still accepts every shape a real provider id takes', async () => {
        // Numeric (TMDB, RAWG), OL work keys, MusicBrainz UUIDs, RAWG slugs.
        // A guard that rejected these would break the public item page.
        const { default: request } = await import('supertest');
        for (const good of ['550', 'OL45883W', '6e335887-60ba-38f0-95af-fae7774336bf', 'the-witcher-3']) {
            vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
            const res = await api().get(`/movies/details/film/${good}`);
            // Anything but the 400 the guard would have produced.
            expect(res.status, good).not.toBe(400);
        }
        expect(request).toBeDefined();
    });
});

// Found in review: optionalAuth read cookies.token, a name nothing sets, so
// the cookie fallback never fired.
describe('optionalAuth recognises the session cookie', () => {
    it('identifies the owner from the cookie alone, with no Bearer header', async () => {
        const user = await registerUser();
        await user.auth(api().patch('/account/privacy')).send({ profilePublic: false });

        const login = await api().post('/auth/login')
            .send({ email: user.email, password: 'correct-horse-battery' });
        const cookie = login.headers['set-cookie'].find((c) => c.startsWith('jwt='));

        // A private profile is visible to its owner and nobody else, so a 200
        // here proves the cookie was read and the identity attached.
        const res = await api().get(`/social/profile/${user.id}`).set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.data.profile.isSelf).toBe(true);
    });

    it('still treats a bad cookie as a stranger rather than erroring', async () => {
        const user = await registerUser();
        const res = await api().get(`/social/profile/${user.id}`).set('Cookie', 'jwt=not-a-real-token');

        expect(res.status).toBe(200);
        expect(res.body.data.profile.isSelf).toBe(false);
    });
});
