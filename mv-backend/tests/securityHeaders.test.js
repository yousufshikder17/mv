import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, createSchema, resetTables, registerUser } from './helpers/testDb.js';

beforeAll(createSchema);
beforeEach(resetTables);

describe('security headers', () => {
    it('sets the headers a browser needs before this is public', async () => {
        const res = await api().get('/movies/variety');

        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBeDefined();
        expect(res.headers['referrer-policy']).toBeDefined();
        expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('allows every cover host the adapters actually use', async () => {
        // A CSP that forgets one of these ships a page with missing images.
        // Each entry corresponds to an adapter, so this fails when a media
        // source is added and its image host is not.
        const csp = (await api().get('/movies/variety')).headers['content-security-policy'];

        for (const host of [
            'https://image.tmdb.org',
            'https://media.rawg.io',
            'https://covers.openlibrary.org',
            'https://coverartarchive.org',
            'https://*.mzstatic.com',
            // Both cover hosts redirect to numbered archive.org nodes, and CSP
            // is enforced against the final target. Verified in a real browser:
            // without this, every book and album cover is blocked.
            'https://*.archive.org',
        ]) {
            expect(csp).toContain(host);
        }
    });

    it('allows the webfonts index.html asks for', async () => {
        // Missing these does not error anywhere obvious - the site just falls
        // back to system fonts, in production only. Caught by loading a real
        // browser against the built bundle, not by reading the header.
        const csp = (await api().get('/movies/variety')).headers['content-security-policy'];
        expect(csp).toContain('https://fonts.googleapis.com');
        expect(csp).toContain('https://fonts.gstatic.com');
    });

    it('does not permit inline or remote script', async () => {
        const csp = (await api().get('/movies/variety')).headers['content-security-policy'];
        expect(csp).toMatch(/script-src [^;]*'self'/);
        expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/);
    });
});

describe('the session cookie', () => {
    it('is httpOnly and SameSite=Strict when issued', async () => {
        const res = await api().post('/auth/register').send({
            name: 'Cookie', email: 'cookie@example.com', password: 'correct-horse-battery',
        });

        const cookie = res.headers['set-cookie'].find((c) => c.startsWith('jwt='));
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Strict/i);
    });

    it('is cleared with the same attributes it was set with', async () => {
        // A cookie is identified by name AND attributes. Clearing it with a
        // different set writes a second cookie and leaves the session one
        // alive, so logout silently fails to log anyone out.
        const user = await registerUser();
        const res = await user.auth(api().post('/auth/logout'));

        const cookie = res.headers['set-cookie'].find((c) => c.startsWith('jwt='));
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Strict/i);
        expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    });
});
