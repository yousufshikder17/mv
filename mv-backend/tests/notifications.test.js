import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../src/config/db.js';
import { notifications, pushSubscriptions } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';
import { notify, composeAlert } from '../src/services/notifier.js';

beforeAll(createSchema);
beforeEach(resetTables);
afterEach(() => vi.unstubAllGlobals());

const due = (over = {}) => ({
    alertId: 'a', userId: null, email: 'x@example.test', name: 'X',
    title: 'Elden Ring', mediaItemId: null,
    priceCents: 5159, currency: 'USD', thresholdCents: 6000, ...over,
});

describe('composeAlert', () => {
    it('states the price and the threshold once, for all three channels', () => {
        const m = composeAlert(due());
        expect(m.title).toBe('Elden Ring is $51.59');
        expect(m.body).toContain('$60.00');
        expect(m.url).toContain('/media/game/');
    });

    it('uses the right symbol for other currencies', () => {
        expect(composeAlert(due({ currency: 'GBP' })).title).toContain('\u00a3');
    });
});

// The in-app record is written first and unconditionally. If the mail provider
// is down and nobody granted push permission, the news must still be waiting
// in the app - a price drop nobody ever hears about is the one outcome worth
// engineering against.
describe('the in-app notification always lands', () => {
    const setup = async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg', title: 'Elden Ring' });
        return { user, game };
    };

    it('writes a notification with no email key and no push subscription', async () => {
        const { user, game } = await setup();
        const saved = process.env.RESEND_API_KEY;
        delete process.env.RESEND_API_KEY;

        const result = await notify(due({ userId: user.id, mediaItemId: game.id, email: user.email }));

        expect(result.inApp).toBe(true);
        expect(result.email).toMatchObject({ skipped: expect.any(String) });
        const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id));
        expect(rows).toHaveLength(1);
        expect(rows[0].title).toContain('Elden Ring');
        if (saved) process.env.RESEND_API_KEY = saved;
    });

    it('still writes it when email delivery throws', async () => {
        const { user, game } = await setup();
        process.env.RESEND_API_KEY = 'test-key';
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

        const result = await notify(due({ userId: user.id, mediaItemId: game.id, email: user.email }));

        expect(result.inApp).toBe(true);
        expect(result.email.error).toBeTruthy();
        expect(await db.select().from(notifications)).toHaveLength(1);
        delete process.env.RESEND_API_KEY;
    });

    it('sends email when a key is configured', async () => {
        const { user, game } = await setup();
        process.env.RESEND_API_KEY = 'test-key';
        const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: '1' }) }));
        vi.stubGlobal('fetch', spy);

        await notify(due({ userId: user.id, mediaItemId: game.id, email: user.email }));

        expect(String(spy.mock.calls[0][0])).toContain('resend.com');
        delete process.env.RESEND_API_KEY;
    });
});

describe('notification inbox', () => {
    it('lists only the requesting user rows, with an unread count', async () => {
        const alice = await registerUser();
        const bob = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await notify(due({ userId: alice.id, mediaItemId: game.id, email: alice.email }));
        await notify(due({ userId: bob.id, mediaItemId: game.id, email: bob.email }));

        const res = await alice.auth(api().get('/notifications'));
        expect(res.body.results).toBe(1);
        expect(res.body.unread).toBe(1);
    });

    it('marks one read, and marks all read', async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await notify(due({ userId: user.id, mediaItemId: game.id, email: user.email }));
        await notify(due({ userId: user.id, mediaItemId: game.id, email: user.email, priceCents: 4000 }));

        const listed = await user.auth(api().get('/notifications'));
        const first = listed.body.data.notifications[0].id;

        await user.auth(api().post('/notifications/read')).send({ id: first });
        expect((await user.auth(api().get('/notifications'))).body.unread).toBe(1);

        await user.auth(api().post('/notifications/read')).send({});
        expect((await user.auth(api().get('/notifications'))).body.unread).toBe(0);
    });

    it('cannot mark a notification belonging to another user as read', async () => {
        const alice = await registerUser();
        const mallory = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await notify(due({ userId: alice.id, mediaItemId: game.id, email: alice.email }));
        const listed = await alice.auth(api().get('/notifications'));

        const res = await mallory.auth(api().post('/notifications/read'))
            .send({ id: listed.body.data.notifications[0].id });

        expect(res.body.updated).toBe(0);
    });

    it('requires an account', async () => {
        expect((await api().get('/notifications')).status).toBe(401);
    });
});

describe('push subscriptions', () => {
    const sub = (endpoint = 'https://push.test/abc') => ({
        endpoint, keys: { p256dh: 'p', auth: 'a' },
    });

    it('serves the public VAPID key and never the private one', async () => {
        const user = await registerUser();
        const res = await user.auth(api().get('/notifications/vapid-key'));
        expect(res.status).toBe(200);
        expect(res.body.data.publicKey).toBeTruthy();
        const priv = process.env.VAPID_PRIVATE_KEY;
        if (priv) expect(JSON.stringify(res.body)).not.toContain(priv);
    });

    it('replaces rather than duplicates when a browser re-subscribes', async () => {
        const user = await registerUser();
        await user.auth(api().post('/notifications/subscribe')).send(sub());
        await user.auth(api().post('/notifications/subscribe')).send(sub());

        // Two rows for one browser would buzz twice for every alert.
        expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
    });

    it('keeps a laptop and a phone as separate subscriptions', async () => {
        const user = await registerUser();
        await user.auth(api().post('/notifications/subscribe')).send(sub('https://push.test/laptop'));
        await user.auth(api().post('/notifications/subscribe')).send(sub('https://push.test/phone'));

        expect(await db.select().from(pushSubscriptions)).toHaveLength(2);
    });

    it('reassigns an endpoint when another account signs in on that browser', async () => {
        // Otherwise the previous user keeps being buzzed on a machine they no
        // longer use.
        const alice = await registerUser();
        const bob = await registerUser();
        await alice.auth(api().post('/notifications/subscribe')).send(sub());
        await bob.auth(api().post('/notifications/subscribe')).send(sub());

        const rows = await db.select().from(pushSubscriptions);
        expect(rows).toHaveLength(1);
        expect(rows[0].userId).toBe(bob.id);
    });

    it('rejects a malformed subscription', async () => {
        const user = await registerUser();
        expect((await user.auth(api().post('/notifications/subscribe')).send({})).status).toBe(400);
        expect((await user.auth(api().post('/notifications/subscribe'))
            .send({ endpoint: 'x' })).status).toBe(400);
    });

    it('unsubscribes a browser', async () => {
        const user = await registerUser();
        await user.auth(api().post('/notifications/subscribe')).send(sub());
        await user.auth(api().delete('/notifications/subscribe')).send({ endpoint: 'https://push.test/abc' });

        expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
    });
});
