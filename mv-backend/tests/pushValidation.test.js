import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, createSchema, resetTables, registerUser } from './helpers/testDb.js';

beforeAll(createSchema);
beforeEach(resetTables);

const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

const subscribe = (user, endpoint) =>
    user.auth(api().post('/notifications/subscribe')).send({ endpoint, keys });

describe('push endpoints are an SSRF surface, not just a string', () => {
    // Whatever is stored here is a URL the poller fetches every time an alert
    // fires, from inside the network.
    it('accepts a real push service endpoint', async () => {
        const user = await registerUser();
        const res = await subscribe(user, 'https://fcm.googleapis.com/fcm/send/abc123');
        expect(res.status).toBe(201);
    });

    it('refuses cloud metadata and loopback addresses', async () => {
        const user = await registerUser();
        for (const bad of [
            'https://169.254.169.254/latest/meta-data/',
            'https://127.0.0.1/admin',
            'https://localhost:8080/',
            'https://10.0.0.5/internal',
            'https://192.168.1.1/router',
            'https://[::1]/',
        ]) {
            expect((await subscribe(user, bad)).status, bad).toBe(400);
        }
    });

    it('refuses plain http, so a token never crosses the wire in clear', async () => {
        const user = await registerUser();
        expect((await subscribe(user, 'http://fcm.googleapis.com/fcm/send/x')).status).toBe(400);
    });

    it('refuses bare internal hostnames', async () => {
        const user = await registerUser();
        expect((await subscribe(user, 'https://intranet/')).status).toBe(400);
        expect((await subscribe(user, 'https://db.internal/')).status).toBe(400);
    });

    it('refuses a garbage endpoint and an unbounded one', async () => {
        const user = await registerUser();
        expect((await subscribe(user, 'not-a-url')).status).toBe(400);
        expect((await subscribe(user, 'https://fcm.googleapis.com/' + 'x'.repeat(2100))).status).toBe(400);
    });

    it('refuses keys that are not base64url', async () => {
        const user = await registerUser();
        const res = await user.auth(api().post('/notifications/subscribe'))
            .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: '<script>', auth: 'ok' } });
        expect(res.status).toBe(400);
    });

    it('refuses a mark-read id that is not a uuid', async () => {
        const user = await registerUser();
        expect((await user.auth(api().post('/notifications/read')).send({ id: 'nope' })).status).toBe(400);
        // Omitted means "all", which stays valid.
        expect((await user.auth(api().post('/notifications/read')).send({})).status).toBe(200);
    });
});
