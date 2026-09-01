import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// A page view is not an API call. Serving index.html from the API budget meant
// browsing spent it - 100 requests per fifteen minutes covers one person
// clicking around and does not cover an office behind a single address - and
// the failure was ugly: a rate-limited navigation returns raw JSON where the
// application should be.
const mount = async (max) => {
    vi.resetModules();
    process.env.RATE_LIMIT_MAX_REQUESTS = String(max);
    const { default: apiLimiter } = await import('../src/middleware/rateLimiter.js');

    const app = express();
    // Same order as app.js: pages first, then the limiter, then the API.
    app.get('/films', (req, res) => {
        if (!String(req.headers.accept ?? '').includes('text/html')) return res.status(404).end();
        res.type('html').send('<!doctype html><title>page</title>');
    });
    app.use(apiLimiter);
    app.get('/movies/variety', (req, res) => res.json({ ok: true }));
    return request(app);
};

afterEach(() => vi.resetModules());

describe('page views do not spend the API budget', () => {
    it('keeps serving pages past the API limit', async () => {
        const api = await mount(2);
        const browser = { Accept: 'text/html,application/xhtml+xml' };

        for (let i = 0; i < 6; i++) {
            const res = await api.get('/films').set(browser);
            expect(res.status, `navigation ${i + 1}`).toBe(200);
            expect(res.headers['content-type']).toContain('text/html');
        }
    });

    it('still limits the API itself', async () => {
        // The limiter has to keep doing its job; this only moves what counts.
        const api = await mount(2);

        expect((await api.get('/movies/variety')).status).toBe(200);
        expect((await api.get('/movies/variety')).status).toBe(200);
        expect((await api.get('/movies/variety')).status).toBe(429);
    });

    it('does not let navigations eat the allowance an API caller needs', async () => {
        const api = await mount(2);
        const browser = { Accept: 'text/html,application/xhtml+xml' };

        // Browse first, then call the API. The API budget should be untouched.
        for (let i = 0; i < 5; i++) await api.get('/films').set(browser);

        expect((await api.get('/movies/variety')).status).toBe(200);
        expect((await api.get('/movies/variety')).status).toBe(200);
    });
});
