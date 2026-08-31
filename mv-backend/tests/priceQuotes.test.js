import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../src/config/db.js';
import { priceQuotes } from '../src/db/schema.js';
import { createSchema, resetTables } from './helpers/testDb.js';
import { storeQuotes, pruneOldQuotes } from '../src/jobs/dailyPoll.js';
import { parseKindleFeed } from '../src/adapters/price/kindle.js';

const quote = (over = {}) => ({
    source: 'kindle_rss',
    externalId: 'B0851LDKLL',
    title: 'Piranesi',
    platform: 'Amazon Kindle',
    priceCents: 299,
    currency: 'USD',
    originalPriceCents: 1399,
    discountPercent: 79,
    saleEnds: null,
    url: 'https://www.amazon.com/dp/B0851LDKLL',
    fetchedAt: new Date('2026-08-31T12:00:00Z'),
    quoteDate: '2026-08-31',
    ...over,
});

const all = () => db.select().from(priceQuotes);

beforeAll(createSchema);
beforeEach(resetTables);

describe('price_quote migration', () => {
    it('applies cleanly and creates the table', async () => {
        const res = await db.execute(
            sql`select column_name from information_schema.columns where table_name = 'price_quote'`,
        );
        const cols = (res.rows ?? res).map((r) => r.column_name);
        expect(cols).toEqual(expect.arrayContaining([
            'source', 'external_id', 'price_cents', 'currency', 'quote_date', 'url',
        ]));
    });
});

describe('storeQuotes', () => {
    it('inserts a day of quotes', async () => {
        const n = await storeQuotes([quote(), quote({ externalId: 'B000000002' })]);
        expect(n).toBe(2);
        expect(await all()).toHaveLength(2);
    });

    // The roadmap's explicit M0 requirement: re-runs must not double-insert.
    it('is idempotent — a re-run inserts nothing and changes nothing', async () => {
        await storeQuotes([quote()]);
        const second = await storeQuotes([quote()]);

        expect(second).toBe(0);
        expect(await all()).toHaveLength(1);
    });

    it('deduplicates within a single batch too', async () => {
        // Two workflow triggers merged, or a feed listing the same book twice.
        const n = await storeQuotes([quote(), quote({ priceCents: 199 })]);
        expect(n).toBe(1);
        expect(await all()).toHaveLength(1);
    });

    it('keeps the same book on a different day as a separate row', async () => {
        await storeQuotes([quote({ quoteDate: '2026-08-30', priceCents: 499 })]);
        await storeQuotes([quote({ quoteDate: '2026-08-31', priceCents: 299 })]);

        const rows = await all();
        expect(rows).toHaveLength(2);
        // This is the whole point of M0: history that accrues only by polling.
        expect(rows.map((r) => r.priceCents).sort()).toEqual([299, 499]);
    });

    it('keeps the same book from a different source as a separate row', async () => {
        await storeQuotes([quote()]);
        const n = await storeQuotes([quote({ source: 'other_store', priceCents: 350 })]);
        expect(n).toBe(1);
    });

    it('stores money as integers, so no float drift survives a round trip', async () => {
        await storeQuotes([quote({ priceCents: 1299 })]);
        const [row] = await all();
        expect(row.priceCents).toBe(1299);
        expect(Number.isInteger(row.priceCents)).toBe(true);
    });

    it('accepts a parsed feed end to end', async () => {
        const xml = `<rss><channel>
          <item><title>Piranesi $2.99</title>
            <link>https://www.amazon.com/dp/B0851LDKLL</link>
            <description>List price: $13.99</description>
            <pubDate>Sun, 31 Aug 2026 07:00:00 GMT</pubDate></item>
        </channel></rss>`;
        const n = await storeQuotes(parseKindleFeed(xml));
        expect(n).toBe(1);
        const [row] = await all();
        expect(row.externalId).toBe('B0851LDKLL');
        expect(row.priceCents).toBe(299);
    });

    it('does nothing on an empty batch', async () => {
        expect(await storeQuotes([])).toBe(0);
    });
});

describe('pruneOldQuotes', () => {
    it('drops quotes past 90 days and keeps everything inside it', async () => {
        const now = new Date('2026-08-31T00:00:00Z');
        const day = (offset) => {
            const d = new Date(now.getTime() - offset * 864e5);
            return d.toISOString().slice(0, 10);
        };

        await storeQuotes([
            quote({ externalId: 'A000000001', quoteDate: day(1) }),
            quote({ externalId: 'A000000002', quoteDate: day(89) }),
            quote({ externalId: 'A000000003', quoteDate: day(91) }),
            quote({ externalId: 'A000000004', quoteDate: day(400) }),
        ]);

        const pruned = await pruneOldQuotes(now);
        expect(pruned).toBe(2);

        const left = (await all()).map((r) => r.externalId).sort();
        expect(left).toEqual(['A000000001', 'A000000002']);
    });
});
