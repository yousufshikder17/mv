import { describe, it, expect, vi, afterEach } from 'vitest';
import { volumeToQuote, fetchBookPrices, SOURCE, PLATFORM } from '../src/adapters/price/googlebooks.js';

const NOW = new Date('2026-08-31T12:00:00Z');

const volume = (over = {}) => ({
    id: 'KhbGDQAAQBAJ',
    volumeInfo: { title: 'Classical Traditions in Modern Fantasy' },
    saleInfo: {
        saleability: 'FOR_SALE',
        listPrice: { amount: 48.99, currencyCode: 'USD' },
        retailPrice: { amount: 37.72, currencyCode: 'USD' },
        buyLink: 'https://books.google.com/books?id=KhbGDQAAQBAJ',
        ...over.saleInfo,
    },
    ...over,
});

describe('volumeToQuote', () => {
    it('maps a for-sale volume to a PriceQuote', () => {
        const q = volumeToQuote(volume(), NOW);
        expect(q).toMatchObject({
            source: SOURCE,
            platform: PLATFORM,
            externalId: 'KhbGDQAAQBAJ',
            priceCents: 3772,
            originalPriceCents: 4899,
            discountPercent: 23,
            currency: 'USD',
        });
        expect(q.quoteDate).toBe('2026-08-31');
        expect(q.fetchedAt).toBe(NOW);
    });

    it('converts float amounts to integer cents without drift', () => {
        // 0.1 + 0.2 has no business near a price. 19.99 * 100 is 1998.9999...
        const q = volumeToQuote(volume({ saleInfo: { retailPrice: { amount: 19.99, currencyCode: 'USD' } } }), NOW);
        expect(q.priceCents).toBe(1999);
        expect(Number.isInteger(q.priceCents)).toBe(true);
    });

    it('skips NOT_FOR_SALE volumes — a null price is not an observation', () => {
        expect(volumeToQuote({ id: 'x', saleInfo: { saleability: 'NOT_FOR_SALE' } }, NOW)).toBeNull();
    });

    it('skips a volume with no id', () => {
        expect(volumeToQuote({ saleInfo: { retailPrice: { amount: 5, currencyCode: 'USD' } } }, NOW)).toBeNull();
    });

    it('records no discount when list equals retail', () => {
        // Google returns the same figure twice for undiscounted volumes.
        const q = volumeToQuote(volume({ saleInfo: {
            listPrice: { amount: 12.99, currencyCode: 'USD' },
            retailPrice: { amount: 12.99, currencyCode: 'USD' },
        } }), NOW);
        expect(q.originalPriceCents).toBeNull();
        expect(q.discountPercent).toBeNull();
    });

    it('ignores a list price below retail rather than reporting a negative discount', () => {
        const q = volumeToQuote(volume({ saleInfo: {
            listPrice: { amount: 1.99, currencyCode: 'USD' },
            retailPrice: { amount: 9.99, currencyCode: 'USD' },
        } }), NOW);
        expect(q.originalPriceCents).toBeNull();
    });

    it('keeps a free volume, which is a real price', () => {
        const q = volumeToQuote(volume({ saleInfo: { retailPrice: { amount: 0, currencyCode: 'USD' } } }), NOW);
        expect(q.priceCents).toBe(0);
    });

    it('carries the currency Google reports, not an assumed USD', () => {
        const q = volumeToQuote(volume({ saleInfo: { retailPrice: { amount: 8.5, currencyCode: 'GBP' } } }), NOW);
        expect(q.currency).toBe('GBP');
    });

    it('falls back to a books.google URL when buyLink is absent', () => {
        const q = volumeToQuote(volume({ saleInfo: {
            retailPrice: { amount: 5, currencyCode: 'USD' }, buyLink: undefined,
        } }), NOW);
        expect(q.url).toContain('KhbGDQAAQBAJ');
    });

    it('tolerates junk instead of throwing', () => {
        expect(volumeToQuote(null, NOW)).toBeNull();
        expect(volumeToQuote({}, NOW)).toBeNull();
    });
});

describe('fetchBookPrices', () => {
    afterEach(() => vi.unstubAllGlobals());

    const ok = (v) => ({ ok: true, status: 200, json: async () => v });

    it('polls every configured volume and collects the priced ones', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            const id = decodeURIComponent(String(url).split('/volumes/')[1].split('?')[0]);
            return ok(id === 'B' ? { id, saleInfo: { saleability: 'NOT_FOR_SALE' } } : volume({ id }));
        }));

        const { quotes, errors } = await fetchBookPrices('A,B,C', 'test-key', NOW);
        expect(errors).toEqual([]);
        expect(quotes.map((q) => q.externalId)).toEqual(['A', 'C']);
    });

    it('retries a 503 and succeeds — Google returns them constantly', async () => {
        let calls = 0;
        vi.stubGlobal('fetch', vi.fn(async () => {
            calls += 1;
            return calls < 3 ? { ok: false, status: 503 } : ok(volume());
        }));

        const { quotes, errors } = await fetchBookPrices('A', 'test-key', NOW);
        expect(calls).toBe(3);
        expect(quotes).toHaveLength(1);
        expect(errors).toEqual([]);
    }, 20000);

    it('does not retry a 404 — it will not fix itself', async () => {
        let calls = 0;
        vi.stubGlobal('fetch', vi.fn(async () => { calls += 1; return { ok: false, status: 404 }; }));

        const { quotes, errors } = await fetchBookPrices('A', 'test-key', NOW);
        expect(calls).toBe(1);
        expect(quotes).toEqual([]);
        expect(errors[0]).toContain('404');
    });

    it('keeps other volumes when one fails — a lost day cannot be backfilled', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            const id = decodeURIComponent(String(url).split('/volumes/')[1].split('?')[0]);
            if (id === 'BAD') return { ok: false, status: 404 };
            return ok(volume({ id }));
        }));

        const { quotes, errors } = await fetchBookPrices('GOOD1,BAD,GOOD2', 'test-key', NOW);
        expect(quotes).toHaveLength(2);
        expect(errors).toHaveLength(1);
    });

    it('sends the country parameter, without which saleInfo comes back empty', async () => {
        const spy = vi.fn(async () => ok(volume()));
        vi.stubGlobal('fetch', spy);
        await fetchBookPrices('A', 'test-key', NOW);
        expect(String(spy.mock.calls[0][0])).toContain('country=US');
    });

    it('throws when the key or the watch list is missing', async () => {
        await expect(fetchBookPrices('A', '', NOW)).rejects.toThrow(/GOOGLE_BOOKS_API_KEY/);
        await expect(fetchBookPrices('', 'k', NOW)).rejects.toThrow(/GOOGLE_BOOKS_WATCH_IDS/);
    });
});
