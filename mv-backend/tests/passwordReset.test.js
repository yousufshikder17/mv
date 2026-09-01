import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { api, createSchema, resetTables, registerUser } from './helpers/testDb.js';
import { db } from '../src/config/db.js';
import { passwordResets } from '../src/db/schema.js';

beforeAll(createSchema);
beforeEach(async () => {
    await resetTables();
    // Resend is unconfigured in tests so sendMail no-ops; stubbed anyway so
    // nothing here can reach the network.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});
afterEach(() => vi.unstubAllGlobals());

const PASSWORD = 'correct-horse-battery';
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

// The emailed token is never stored in plaintext, so a test cannot read it
// back. This mints one the same way and stores the hash, exactly as the
// endpoint would have.
const issueToken = async (userId, over = {}) => {
    const token = crypto.randomBytes(32).toString('hex');
    await db.insert(passwordResets).values({
        userId,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ...over,
    });
    return token;
};

describe('asking for a reset', () => {
    it('answers identically whether or not the address exists', async () => {
        // Otherwise this is an account-enumeration oracle, and it has to be
        // unauthenticated by definition.
        const user = await registerUser();

        const known = await api().post('/auth/forgot').send({ email: user.email });
        const unknown = await api().post('/auth/forgot').send({ email: 'nobody@example.com' });

        expect(known.status).toBe(unknown.status);
        expect(known.body).toEqual(unknown.body);
    });

    it('stores the token hashed, never in plaintext', async () => {
        // A reset token is a temporary password. A database dump must not hand
        // out working ones.
        const user = await registerUser();
        await api().post('/auth/forgot').send({ email: user.email });

        const [row] = await db.select().from(passwordResets).where(eq(passwordResets.userId, user.id));

        expect(row).toBeDefined();
        expect(row.tokenHash).toHaveLength(64);
        expect(row.usedAt).toBeNull();
    });
});

describe('using a reset token', () => {
    it('changes the password and lets the new one sign in', async () => {
        const user = await registerUser();
        const token = await issueToken(user.id);

        const res = await api().post('/auth/reset').send({ token, password: 'a-brand-new-password' });
        expect(res.status).toBe(200);

        const fresh = await api().post('/auth/login').send({ email: user.email, password: 'a-brand-new-password' });
        expect(fresh.status).toBe(200);

        const stale = await api().post('/auth/login').send({ email: user.email, password: PASSWORD });
        expect(stale.status).toBe(401);
    });

    it('revokes every token the account already had', async () => {
        // The point of the whole thing: if the reset happened because somebody
        // else had the password, leaving their session alive makes it cosmetic.
        const user = await registerUser();
        expect((await user.auth(api().get('/account/export'))).status).toBe(200);

        const token = await issueToken(user.id);
        await api().post('/auth/reset').send({ token, password: 'a-brand-new-password' });

        expect((await user.auth(api().get('/account/export'))).status).toBe(401);
    });

    it('works exactly once', async () => {
        const user = await registerUser();
        const token = await issueToken(user.id);

        expect((await api().post('/auth/reset').send({ token, password: 'first-new-password' })).status).toBe(200);
        expect((await api().post('/auth/reset').send({ token, password: 'second-attempt-pass' })).status).toBe(400);
    });

    it('invalidates other outstanding links for the same account', async () => {
        const user = await registerUser();
        const first = await issueToken(user.id);
        const second = await issueToken(user.id);

        await api().post('/auth/reset').send({ token: first, password: 'a-brand-new-password' });

        expect((await api().post('/auth/reset').send({ token: second, password: 'another-password-x' })).status).toBe(400);
    });

    it('refuses an expired token', async () => {
        const user = await registerUser();
        const token = await issueToken(user.id, { expiresAt: new Date(Date.now() - 1000) });

        expect((await api().post('/auth/reset').send({ token, password: 'a-brand-new-password' })).status).toBe(400);
    });

    it('refuses a forged token', async () => {
        await registerUser();
        const forged = crypto.randomBytes(32).toString('hex');

        expect((await api().post('/auth/reset').send({ token: forged, password: 'a-brand-new-password' })).status).toBe(400);
    });

    it('refuses a password that is too short', async () => {
        const user = await registerUser();
        const token = await issueToken(user.id);

        expect((await api().post('/auth/reset').send({ token, password: 'short' })).status).toBe(400);
    });
});

describe('signing out everywhere', () => {
    it('invalidates tokens on every device, not just this one', async () => {
        const user = await registerUser();
        // A second sign-in stands in for a second device.
        const other = await api().post('/auth/login').send({ email: user.email, password: PASSWORD });
        const otherToken = other.body.token;

        await user.auth(api().post('/auth/sign-out-everywhere'));

        expect((await user.auth(api().get('/account/export'))).status).toBe(401);

        const withOther = await api().get('/account/export').set('Authorization', 'Bearer ' + otherToken);
        expect(withOther.status).toBe(401);
    });

    it('leaves other accounts alone', async () => {
        const leaving = await registerUser();
        const staying = await registerUser();

        await leaving.auth(api().post('/auth/sign-out-everywhere'));

        expect((await staying.auth(api().get('/account/export'))).status).toBe(200);
    });

    it('requires an account', async () => {
        expect((await api().post('/auth/sign-out-everywhere')).status).toBe(401);
    });

    it('lets a fresh sign-in work again afterwards', async () => {
        const user = await registerUser();
        await user.auth(api().post('/auth/sign-out-everywhere'));

        const again = await api().post('/auth/login').send({ email: user.email, password: PASSWORD });
        expect(again.status).toBe(200);

        const withNew = await api().get('/account/export').set('Authorization', 'Bearer ' + again.body.token);
        expect(withNew.status).toBe(200);
    });
});

describe('the revocation check on ordinary use', () => {
    it('is invisible when nothing has been revoked', async () => {
        const user = await registerUser();

        expect((await user.auth(api().get('/account/export'))).status).toBe(200);
        expect((await user.auth(api().get('/social/feed'))).status).toBe(200);
    });
});
