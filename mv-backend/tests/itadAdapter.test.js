import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    dealsToQuotes,
    historyLowOf,
    lookupGameId,
    fetchPrices,
    resetRateLimit,
    rateLimitState,
} from '../src/adapters/price/itad.js';

const NOW = new Date('2026-08-31T12:00:00Z');

const entry = (over = {}) => ({
    id: 'itad-uuid',
    deals: [
        { shop: { id: 20, name: 'GameBillet' }, price: { amountInt: 5159, currency: 'USD' },
          regular: { amountInt: 5999, currency: 'USD' }, cut: 14, url: 'https://a.test' },
        { shop: { id: 6, name: 'Fanatical' }, price: { amountInt: 5388, currency: 'USD' },
          regular: { amountInt: 5999, currency: 'USD' }, cut: 10, url: 'https://b.test' },
    ],
    historyLow: {
        all: { amountInt: 2995, currency: 'USD' },
        y1: { amountInt: 3427, currency: 'USD' },
        m3: { amountInt: 3841, currency: 'USD' },
    },
    ...over,
});

beforeEach(() => { resetRateLimit(); process.env.ITAD_API_KEY ||= 'test-key'; });
afterEach(() => vi.unstubAllGlobals());

describe('mapping deals to quotes', () => {
    it('keeps money as the integer cents ITAD already reports', () => {
        // amountInt is cents. No float ever enters the pipeline.
        const [q] = dealsToQuotes(entry(), 'media-1', NOW);
        expect(q.priceCents).toBe(5159);
        expect(q.originalPriceCents).toBe(5999);
        expect(Number.isInteger(q.priceCents)).toBe(true);
    });

    it('emits one quote per shop, keyed so they cannot collide', () => {
        // One game on five stores is five rows for the day; the unique
        // constraint is on (source, externalId, quoteDate).
        const quotes = dealsToQuotes(entry(), 'media-1', NOW);
        expect(quotes).toHaveLength(2);
        expect(new Set(quotes.map((q) => q.externalId)).size).toBe(2);
        expect(quotes[0].externalId).toContain('itad-uuid');
    });

    it('records no discount when the regular price is not higher', () => {
        const flat = entry({ deals: [{ shop: { id: 1, name: 'S' },
            price: { amountInt: 5999 }, regular: { amountInt: 5999 }, cut: 0, url: 'x' }] });
        expect(dealsToQuotes(flat, 'm', NOW)[0].originalPriceCents).toBeNull();
    });

    it('skips a deal with no price rather than storing a null', () => {
        const broken = entry({ deals: [{ shop: { id: 1, name: 'S' }, price: null, url: 'x' }] });
        expect(dealsToQuotes(broken, 'm', NOW)).toHaveLength(0);
    });

    it('carries a sale expiry when one is given', () => {
        const expiring = entry({ deals: [{ shop: { id: 1, name: 'S' },
            price: { amountInt: 100 }, regular: { amountInt: 200 }, cut: 50,
            url: 'x', expiry: '2026-09-05T00:00:00Z' }] });
        expect(dealsToQuotes(expiring, 'm', NOW)[0].saleEnds).toBeInstanceOf(Date);
    });

    it('handles an entry with no deals at all', () => {
        expect(dealsToQuotes(entry({ deals: [] }), 'm', NOW)).toEqual([]);
        expect(dealsToQuotes(null, 'm', NOW)).toEqual([]);
    });
});

// SPEC 7: ITAD serves history, so it is read and never accumulated. SPEC 12
// puts any replacement for them out of scope entirely.
describe('history is read from ITAD, not built', () => {
    it('exposes all-time, 1-year and 3-month lows in cents', () => {
        expect(historyLowOf(entry())).toEqual({
            allTimeCents: 2995, year1Cents: 3427, month3Cents: 3841, currency: 'USD',
        });
    });

    it('returns null when they have no history for a game', () => {
        expect(historyLowOf(entry({ historyLow: null }))).toBeNull();
    });
});

// Their terms: rate limiting returns 429 with Retry-After, and attempting to
// work around limits causes a ban. So a 429 pauses the adapter rather than
// triggering a retry.
describe('429 handling is compliance, not politeness', () => {
    it('stops calling out entirely after a 429', async () => {
        const spy = vi.fn(async () => ({
            status: 429, ok: false,
            headers: { get: () => '120' },
        }));
        vi.stubGlobal('fetch', spy);

        await expect(lookupGameId('x')).rejects.toMatchObject({ statusCode: 429 });
        expect(spy).toHaveBeenCalledTimes(1);

        // The second call must not reach the network at all.
        await expect(fetchPrices(['a'])).rejects.toMatchObject({ statusCode: 429 });
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('honours Retry-After in seconds', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ status: 429, ok: false, headers: { get: () => '300' } })));
        await expect(lookupGameId('x')).rejects.toThrow();

        const waitMs = rateLimitState().backoffUntil - Date.now();
        expect(waitMs).toBeGreaterThan(290_000);
        expect(waitMs).toBeLessThanOrEqual(300_000);
    });

    it('defaults to a full minute when Retry-After is missing', async () => {
        // Guessing low is how a rate limit becomes a ban.
        vi.stubGlobal('fetch', vi.fn(async () => ({ status: 429, ok: false, headers: { get: () => null } })));
        await expect(lookupGameId('x')).rejects.toThrow();
        expect(rateLimitState().backoffUntil - Date.now()).toBeGreaterThan(50_000);
    });

    it('resumes once the window has passed', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ status: 429, ok: false, headers: { get: () => '1' } })));
        await expect(lookupGameId('x')).rejects.toThrow();

        resetRateLimit();
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, headers: { get: () => null },
            json: async () => ({ found: true, game: { id: 'abc' } }),
        })));
        expect(await lookupGameId('x')).toBe('abc');
    });
});

describe('ITAD errors', () => {
    it('names the key when ITAD rejects it', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, headers: { get: () => null } })));
        await expect(lookupGameId('x')).rejects.toThrow(/API key/);
    });

    it('reports a missing key without calling out', async () => {
        const saved = process.env.ITAD_API_KEY;
        delete process.env.ITAD_API_KEY;
        const spy = vi.fn();
        vi.stubGlobal('fetch', spy);

        await expect(lookupGameId('x')).rejects.toMatchObject({ statusCode: 503 });
        expect(spy).not.toHaveBeenCalled();
        process.env.ITAD_API_KEY = saved;
    });

    it('returns null for a game ITAD does not carry', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, headers: { get: () => null },
            json: async () => ({ found: false }),
        })));
        expect(await lookupGameId('nonexistent')).toBeNull();
    });
});
