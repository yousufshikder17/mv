import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { api, createSchema, resetTables } from './helpers/testDb.js';
import { clearCache } from '../src/utils/cache.js';

beforeAll(createSchema);
beforeEach(async () => { await resetTables(); clearCache(); });
afterEach(() => vi.unstubAllGlobals());

const MBID = '6e335887-60ba-38f0-95af-fae7774336bf';
const CAA = `https://coverartarchive.org/release-group/${MBID}/front-250`;

const archiveSays = (ok) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 400 })));

describe('resolving an album cover', () => {
    it('redirects to the archive when the art exists', async () => {
        archiveSays(true);
        const res = await api().get(`/covers/album/${MBID}`);

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(CAA);
    });

    it('serves a placeholder instead of failing when there is none', async () => {
        // The whole point: the browser must never see a failed image request.
        // The archive answers 400 for a release group with no artwork.
        archiveSays(false);
        const res = await api().get(`/covers/album/${MBID}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
    });

    it('asks the archive once per album, then never again', async () => {
        // The reason this lives on the image path rather than in search: the
        // cost is paid once per album across every user, forever.
        archiveSays(true);

        await api().get(`/covers/album/${MBID}`);
        await api().get(`/covers/album/${MBID}`);
        await api().get(`/covers/album/${MBID}`);

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('remembers a negative as long as a positive', async () => {
        archiveSays(false);
        await api().get(`/covers/album/${MBID}`);
        await api().get(`/covers/album/${MBID}`);

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('never proxies the image itself', async () => {
        // A redirect keeps this server out of the bytes: the browser fetches
        // from the archive directly.
        archiveSays(true);
        const res = await api().get(`/covers/album/${MBID}`);

        expect(res.headers.location).toMatch(/^https:\/\/coverartarchive\.org\//);
        expect(res.body).toEqual({});
    });

    it('answers a placeholder for a malformed id rather than calling out', async () => {
        archiveSays(true);
        const res = await api().get('/covers/album/not-a-uuid');

        expect(res.status).toBe(200);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not blank a cover for a month when the archive times out', async () => {
        // A blip must not be cached as "no art" for the full TTL... but it is
        // cached, so this documents the accepted trade: a timeout reads as no
        // art until the entry expires.
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
        const res = await api().get(`/covers/album/${MBID}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
    });
});
