import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';

beforeAll(createSchema);
beforeEach(resetTables);

const PASSWORD = 'correct-horse-battery';

// GDPR Article 17. The privacy page promised erasure before it existed.
describe('deleting an account', () => {
    it('refuses without the password, even though the caller is signed in', async () => {
        // Irreversible and no undo, so a token lifted from a shared machine
        // must not be enough on its own.
        const user = await registerUser();

        expect((await user.auth(api().delete('/account')).send({})).status).toBe(400);
        expect((await user.auth(api().delete('/account')).send({ password: 'wrong' })).status).toBe(401);

        // Still there.
        expect((await api().get(`/social/profile/${user.id}`)).status).toBe(200);
    });

    it('requires an account at all', async () => {
        expect((await api().delete('/account').send({ password: PASSWORD })).status).toBe(401);
    });

    it('removes the account and everything it created', async () => {
        const user = await registerUser();
        const film = await createMovie();

        await user.auth(api().post('/watchlist')).send({ movieId: film.id });
        await user.auth(api().put(`/social/items/${film.id}/review`)).send({ body: 'Mine.' });
        await user.auth(api().post(`/social/items/${film.id}/comments`)).send({ body: 'Also mine.' });
        const list = await user.auth(api().post('/lists')).send({ name: 'Mine', isPublic: true });
        await user.auth(api().post(`/lists/${list.body.data.list.id}/items`)).send({ mediaItemId: film.id });

        const res = await user.auth(api().delete('/account')).send({ password: PASSWORD });
        expect(res.status).toBe(200);

        // The profile is gone, and so is everything that hung off it.
        expect((await api().get(`/social/profile/${user.id}`)).status).toBe(404);
        expect((await api().get(`/social/items/${film.id}/reviews`)).body.results).toBe(0);
        expect((await api().get(`/social/items/${film.id}/comments`)).body.results).toBe(0);
        expect((await api().get(`/lists/${list.body.data.list.id}`)).status).toBe(404);
        expect((await api().get('/lists/browse')).body.results).toBe(0);
    });

    it('leaves the shared catalogue alone', async () => {
        // A film is nobody's personal data, and removing it would delete other
        // people's history along with this account's.
        const user = await registerUser();
        const film = await createMovie({ title: 'Shared' });
        await user.auth(api().post('/watchlist')).send({ movieId: film.id });

        await user.auth(api().delete('/account')).send({ password: PASSWORD });

        const other = await registerUser();
        const res = await other.auth(api().post('/watchlist')).send({ movieId: film.id });
        expect(res.status).toBe(201);
    });

    it('does not take another account down with it', async () => {
        const leaving = await registerUser();
        const staying = await registerUser();
        const film = await createMovie();
        await staying.auth(api().put(`/social/items/${film.id}/review`)).send({ body: 'Still here.' });
        await leaving.auth(api().post(`/social/follow/${staying.id}`));

        await leaving.auth(api().delete('/account')).send({ password: PASSWORD });

        expect((await api().get(`/social/profile/${staying.id}`)).status).toBe(200);
        expect((await api().get(`/social/items/${film.id}/reviews`)).body.results).toBe(1);
        // The follow went with the account that made it.
        expect((await api().get(`/social/profile/${staying.id}`)).body.data.profile.followers).toBe(0);
    });

    it('clears the session cookie, so it cannot outlive the account', async () => {
        const user = await registerUser();
        const res = await user.auth(api().delete('/account')).send({ password: PASSWORD });

        const cookie = res.headers['set-cookie'].find((c) => c.startsWith('jwt='));
        expect(cookie).toMatch(/SameSite=Strict/i);
        expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    });
});
