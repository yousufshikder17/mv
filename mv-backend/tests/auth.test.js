import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { api, createSchema, registerUser, resetTables } from './helpers/harness.js';

beforeAll(createSchema);
beforeEach(resetTables);

const VALID = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse-battery',
};

const cookieFor = (res, name) =>
    (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));

describe('registration', () => {
    it('creates a user and returns it with a token', async () => {
        const res = await api().post('/auth/register').send(VALID);

        expect(res.status).toBe(201);
        expect(res.body.user).toMatchObject({ name: VALID.name, email: VALID.email });
        expect(res.body.user.id).toEqual(expect.any(String));
        expect(res.body.token).toEqual(expect.any(String));
    });

    it('never returns the password, hashed or otherwise', async () => {
        const res = await api().post('/auth/register').send(VALID);

        expect(res.body.user).not.toHaveProperty('password');
        expect(JSON.stringify(res.body)).not.toContain(VALID.password);
    });

    it('sets an httpOnly jwt cookie so the token is not readable from JS', async () => {
        const res = await api().post('/auth/register').send(VALID);
        const cookie = cookieFor(res, 'jwt');

        expect(cookie).toBeDefined();
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Strict/i);
    });

    it('issues a token that carries an expiry', async () => {
        // An unbounded token cannot be revoked: logout only clears the cookie,
        // so exp is the sole limit on one that has been copied elsewhere.
        const res = await api().post('/auth/register').send(VALID);
        const claims = jwt.decode(res.body.token);

        expect(claims.exp).toEqual(expect.any(Number));
        expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('rejects a second registration with the same email', async () => {
        await api().post('/auth/register').send(VALID);
        const res = await api().post('/auth/register').send(VALID);

        expect(res.status).toBe(400);
    });
});

describe('login', () => {
    it('returns 200 with a token for correct credentials', async () => {
        await api().post('/auth/register').send(VALID);
        const res = await api()
            .post('/auth/login')
            .send({ email: VALID.email, password: VALID.password });

        // 200, not 201 — logging in creates nothing.
        expect(res.status).toBe(200);
        expect(res.body.token).toEqual(expect.any(String));
        expect(res.body.user.email).toBe(VALID.email);
    });

    it('rejects a wrong password', async () => {
        await api().post('/auth/register').send(VALID);
        const res = await api()
            .post('/auth/login')
            .send({ email: VALID.email, password: 'not-the-password' });

        expect(res.status).toBe(401);
        expect(res.body.token).toBeUndefined();
    });

    it('rejects an unknown email', async () => {
        const res = await api()
            .post('/auth/login')
            .send({ email: 'nobody@example.com', password: VALID.password });

        expect(res.status).toBe(401);
    });

    it('does not reveal whether an email is registered', async () => {
        // Distinct messages for "no such user" and "wrong password" turn the
        // login endpoint into an account-enumeration oracle.
        await api().post('/auth/register').send(VALID);

        const wrongPassword = await api()
            .post('/auth/login')
            .send({ email: VALID.email, password: 'not-the-password' });
        const unknownEmail = await api()
            .post('/auth/login')
            .send({ email: 'nobody@example.com', password: VALID.password });

        expect(wrongPassword.status).toBe(unknownEmail.status);
        expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
    });

    it('never returns the password', async () => {
        await api().post('/auth/register').send(VALID);
        const res = await api()
            .post('/auth/login')
            .send({ email: VALID.email, password: VALID.password });

        expect(JSON.stringify(res.body)).not.toContain(VALID.password);
    });
});

describe('logout', () => {
    it('clears the jwt cookie', async () => {
        const res = await api().post('/auth/logout');
        const cookie = cookieFor(res, 'jwt');

        expect(res.status).toBe(200);
        expect(cookie).toMatch(/jwt=;/);
    });

    it('reports success without a typo in the payload', async () => {
        const res = await api().post('/auth/logout');
        expect(res.body.status).toBe('success');
    });
});

describe('authenticating a request', () => {
    it('accepts a bearer token', async () => {
        const user = await registerUser();
        const res = await user.auth(api().get('/watchlist'));

        expect(res.status).toBe(200);
    });

    it('accepts the cookie the login set', async () => {
        await api().post('/auth/register').send(VALID);
        const login = await api()
            .post('/auth/login')
            .send({ email: VALID.email, password: VALID.password });

        const res = await api()
            .get('/watchlist')
            .set('Cookie', cookieFor(login, 'jwt'));

        expect(res.status).toBe(200);
    });

    it('rejects a request with no token', async () => {
        const res = await api().get('/watchlist');
        expect(res.status).toBe(401);
    });

    it('rejects a malformed token', async () => {
        const res = await api()
            .get('/watchlist')
            .set('Authorization', 'Bearer not-a-jwt');

        expect(res.status).toBe(401);
    });

    it('rejects a token signed with the wrong secret', async () => {
        const forged = jwt.sign({ id: crypto.randomUUID() }, 'a-different-secret', {
            expiresIn: '1d',
        });
        const res = await api().get('/watchlist').set('Authorization', `Bearer ${forged}`);

        expect(res.status).toBe(401);
    });

    it('rejects an expired token', async () => {
        const user = await registerUser();
        const expired = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: '-1s',
        });
        const res = await api().get('/watchlist').set('Authorization', `Bearer ${expired}`);

        expect(res.status).toBe(401);
    });

    it('rejects a validly signed token for a user that no longer exists', async () => {
        // The signature is genuine, so only the user lookup catches this.
        const ghost = jwt.sign({ id: crypto.randomUUID() }, process.env.JWT_SECRET, {
            expiresIn: '1d',
        });
        const res = await api().get('/watchlist').set('Authorization', `Bearer ${ghost}`);

        expect(res.status).toBe(401);
    });

    it('does not leak the verification failure reason outside development', async () => {
        // NODE_ENV is 'test' here, so the detail branch must stay closed.
        const res = await api()
            .get('/watchlist')
            .set('Authorization', 'Bearer not-a-jwt');

        expect(res.body.detail).toBeUndefined();
        expect(res.body.message).toBe('Unauthorized: Invalid or expired token');
    });
});
