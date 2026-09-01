import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// The limiters are tested against a stub handler rather than the real app.
//
// express-rate-limit reads its configuration once, when the module loads, and
// keeps its counters on the middleware instance - so varying the limit per
// test needs a fresh import, and a fresh import of the whole app would bring a
// fresh empty database with it. What matters here is the limiter's behaviour,
// not what it is protecting.
const mount = async (env, which, handler) => {
    vi.resetModules();
    Object.assign(process.env, env);
    const limiters = await import('../src/middleware/rateLimiter.js');

    const app = express();
    app.use(express.json());
    app.post('/x', limiters[which], handler);
    return request(app);
};

afterEach(() => vi.resetModules());

describe('the password field is not a 100-guess-per-window field', () => {
    it('stops repeated failed sign-ins well before the global limiter would', async () => {
        // Unauthenticated guessing is the threat; the global 100 per 15
        // minutes is a browsing budget, not a password one.
        const api = await mount({ AUTH_RATE_LIMIT_MAX_REQUESTS: '3' }, 'loginLimiter',
            (req, res) => res.status(401).json({ error: 'Invalid Email or Password' }));

        expect((await api.post('/x').send({})).status).toBe(401);
        expect((await api.post('/x').send({})).status).toBe(401);
        expect((await api.post('/x').send({})).status).toBe(401);
        expect((await api.post('/x').send({})).status).toBe(429);
    });

    it('does not count successful sign-ins against the limit', async () => {
        // Several people behind one office address must not lock each other
        // out. Only failures are abuse.
        const api = await mount({ AUTH_RATE_LIMIT_MAX_REQUESTS: '2' }, 'loginLimiter',
            (req, res) => res.status(200).json({ ok: true }));

        for (let i = 0; i < 6; i++) {
            expect((await api.post('/x').send({})).status).toBe(200);
        }
    });
});

describe('account creation is bounded', () => {
    it('counts successes too, because here the successes are the abuse', async () => {
        const api = await mount({ REGISTER_RATE_LIMIT_MAX_REQUESTS: '2' }, 'registerLimiter',
            (req, res) => res.status(201).json({ ok: true }));

        expect((await api.post('/x').send({})).status).toBe(201);
        expect((await api.post('/x').send({})).status).toBe(201);
        expect((await api.post('/x').send({})).status).toBe(429);
    });
});

describe('a missing or malformed limit never disables a limiter', () => {
    it('falls back to the default rather than NaN', async () => {
        // windowMs: NaN does not fail loudly, it yields a limiter with
        // undefined behaviour - a rate limiter that silently stops limiting.
        const api = await mount({ AUTH_RATE_LIMIT_MAX_REQUESTS: 'not-a-number' }, 'loginLimiter',
            (req, res) => res.status(401).json({}));

        for (let i = 0; i < 10; i++) await api.post('/x').send({});
        // Default is 10 failures, so the eleventh is refused.
        expect((await api.post('/x').send({})).status).toBe(429);
    });
});
