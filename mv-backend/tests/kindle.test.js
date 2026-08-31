import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseKindleFeed, fetchKindleDeals, asinFromUrl, SOURCE, PLATFORM } from '../src/adapters/price/kindle.js';

// A feed item shaped the way RSS 2.0 daily-deal feeds actually arrive:
// CDATA in the description, price in the title, list price labelled in the
// body, and the ASIN only recoverable from the URL.
const item = ({ title, link, desc, pubDate = 'Sun, 31 Aug 2026 07:00:00 GMT', guid }) => `
  <item>
    <title>${title}</title>
    <link>${link}</link>
    ${guid ? `<guid isPermaLink="false">${guid}</guid>` : ''}
    <description><![CDATA[${desc}]]></description>
    <pubDate>${pubDate}</pubDate>
  </item>`;

const feed = (...items) =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>Kindle Daily Deals</title>${items.join('')}</channel></rss>`;

const NOW = new Date('2026-08-31T12:00:00Z');

describe('asinFromUrl', () => {
    it('reads an ASIN from a /dp/ URL', () => {
        expect(asinFromUrl('https://www.amazon.com/dp/B00ABCDEFG?tag=x')).toBe('B00ABCDEFG');
    });

    it('reads an ASIN from a /gp/product/ URL', () => {
        expect(asinFromUrl('https://www.amazon.com/gp/product/B01ZZZZZZZ')).toBe('B01ZZZZZZZ');
    });

    it('returns null when there is no ASIN, rather than guessing', () => {
        expect(asinFromUrl('https://www.amazon.com/deals')).toBeNull();
        expect(asinFromUrl(null)).toBeNull();
    });
});

describe('parseKindleFeed', () => {
    it('maps a well-formed item to a PriceQuote', () => {
        const [q] = parseKindleFeed(feed(item({
            title: 'Piranesi - $2.99',
            link: 'https://www.amazon.com/dp/B0851LDKLL',
            desc: 'A haunting novel. List price: $13.99. Today only.',
        })), NOW);

        expect(q).toMatchObject({
            source: SOURCE,
            platform: PLATFORM,
            externalId: 'B0851LDKLL',
            priceCents: 299,
            originalPriceCents: 1399,
            currency: 'USD',
            url: 'https://www.amazon.com/dp/B0851LDKLL',
        });
        // 299/1399 -> 78.6% off, rounded.
        expect(q.discountPercent).toBe(79);
        expect(q.quoteDate).toEqual(new Date('Sun, 31 Aug 2026 07:00:00 GMT'));
        expect(q.fetchedAt).toBe(NOW);
    });

    it('stores money as integer cents, never a float', () => {
        const [q] = parseKindleFeed(feed(item({
            title: 'Some Book $0.99',
            link: 'https://www.amazon.com/dp/B000000001',
            desc: 'no list price here',
        })), NOW);
        expect(q.priceCents).toBe(99);
        expect(Number.isInteger(q.priceCents)).toBe(true);
    });

    it('handles thousands separators', () => {
        const [q] = parseKindleFeed(feed(item({
            title: 'Collected Works $1,299.00',
            link: 'https://www.amazon.com/dp/B000000002',
            desc: '',
        })), NOW);
        expect(q.priceCents).toBe(129900);
    });

    it('falls back to the description when the title carries no price', () => {
        const [q] = parseKindleFeed(feed(item({
            title: 'Untitled Deal',
            link: 'https://www.amazon.com/dp/B000000003',
            desc: 'Now $4.49 for today only',
        })), NOW);
        expect(q.priceCents).toBe(449);
    });

    it('leaves originalPrice and discount null when the feed quotes no list price', () => {
        const [q] = parseKindleFeed(feed(item({
            title: 'Plain Deal $1.99',
            link: 'https://www.amazon.com/dp/B000000004',
            desc: 'Nothing labelled here.',
        })), NOW);
        expect(q.originalPriceCents).toBeNull();
        expect(q.discountPercent).toBeNull();
    });

    it('rejects a "list price" below the deal price as a mis-parse', () => {
        // $1.99 appearing after the word "was" is the wrong number; a list
        // price under the sale price is never a real markup.
        const [q] = parseKindleFeed(feed(item({
            title: 'Odd Deal $9.99',
            link: 'https://www.amazon.com/dp/B000000005',
            desc: 'was $1.99 last week',
        })), NOW);
        expect(q.originalPriceCents).toBeNull();
    });

    it('skips items with no ASIN and items with no price', () => {
        const quotes = parseKindleFeed(feed(
            item({ title: 'No asin $1.99', link: 'https://www.amazon.com/deals', desc: '' }),
            item({ title: 'No price',      link: 'https://www.amazon.com/dp/B000000006', desc: 'free-ish' }),
            item({ title: 'Good $3.99',    link: 'https://www.amazon.com/dp/B000000007', desc: '' }),
        ), NOW);
        expect(quotes).toHaveLength(1);
        expect(quotes[0].externalId).toBe('B000000007');
    });

    it('recovers the ASIN from guid when link is a redirect wrapper', () => {
        const [q] = parseKindleFeed(feed(item({
            title: 'Wrapped $5.99',
            link: 'https://www.amazon.com/gp/redirect?u=xyz',
            guid: 'https://www.amazon.com/dp/B000000008',
            desc: '',
        })), NOW);
        expect(q.externalId).toBe('B000000008');
    });

    it('decodes entities and strips markup out of the title', () => {
        const [q] = parseKindleFeed(feed(item({
            title: 'Tom &amp; Jerry&#39;s Big Book $6.99',
            link: 'https://www.amazon.com/dp/B000000009',
            desc: '',
        })), NOW);
        expect(q.title).toBe("Tom & Jerry's Big Book $6.99");
    });

    it('falls back to now when pubDate is missing or unparseable', () => {
        const [q] = parseKindleFeed(feed(item({
            title: 'Undated $2.49',
            link: 'https://www.amazon.com/dp/B000000010',
            desc: '',
            pubDate: 'not a date',
        })), NOW);
        expect(q.quoteDate).toBe(NOW);
    });

    it('returns an empty array for junk input instead of throwing', () => {
        expect(parseKindleFeed('')).toEqual([]);
        expect(parseKindleFeed(null)).toEqual([]);
        expect(parseKindleFeed('<rss><channel></channel></rss>')).toEqual([]);
    });
});

describe('fetchKindleDeals — multiple feeds', () => {
    const rss = (...items) =>
        `<rss version="2.0"><channel>${items.join('')}</channel></rss>`;
    const entry = (asin, price) => `
      <item><title>Book ${asin} $${price}</title>
        <link>https://www.amazon.com/dp/${asin}</link>
        <description>a book</description>
        <pubDate>Sun, 31 Aug 2026 07:00:00 GMT</pubDate></item>`;

    const NOW2 = new Date('2026-08-31T12:00:00Z');
    const stub = (byUrl) => vi.stubGlobal('fetch', vi.fn(async (url) => {
        const hit = byUrl[url];
        if (hit instanceof Error) throw hit;
        if (typeof hit === 'number') return { ok: false, status: hit };
        return { ok: true, status: 200, text: async () => hit };
    }));

    afterEach(() => vi.unstubAllGlobals());

    it('merges quotes across every configured feed', async () => {
        stub({
            'https://a/rss': rss(entry('B00000000A', '2.99')),
            'https://b/rss': rss(entry('B00000000B', '3.99')),
        });
        const { quotes, errors } = await fetchKindleDeals('https://a/rss,https://b/rss', NOW2);

        expect(errors).toEqual([]);
        expect(quotes.map((q) => q.externalId).sort()).toEqual(['B00000000A', 'B00000000B']);
    });

    it('dedupes the same book on the same day and keeps the lower price', async () => {
        stub({
            'https://a/rss': rss(entry('B00000000A', '4.99')),
            'https://b/rss': rss(entry('B00000000A', '2.99')),
        });
        const { quotes } = await fetchKindleDeals('https://a/rss,https://b/rss', NOW2);

        expect(quotes).toHaveLength(1);
        expect(quotes[0].priceCents).toBe(299);
    });

    it('keeps good feeds when one fails — a day of prices cannot be backfilled', async () => {
        stub({
            'https://ok/rss':   rss(entry('B00000000A', '2.99')),
            'https://dead/rss': 403,
            'https://gone/rss': new Error('getaddrinfo ENOTFOUND'),
        });
        const { quotes, errors } = await fetchKindleDeals(
            'https://ok/rss,https://dead/rss,https://gone/rss', NOW2);

        expect(quotes).toHaveLength(1);
        expect(errors).toHaveLength(2);
        expect(errors.join(' ')).toMatch(/403/);
    });

    it('trims whitespace and ignores empty entries in the list', async () => {
        stub({ 'https://a/rss': rss(entry('B00000000A', '2.99')) });
        const { quotes } = await fetchKindleDeals(' https://a/rss , , ', NOW2);
        expect(quotes).toHaveLength(1);
    });

    it('throws when nothing is configured, rather than silently polling nothing', async () => {
        await expect(fetchKindleDeals('', NOW2)).rejects.toThrow(/KINDLE_RSS_URL/);
        await expect(fetchKindleDeals(undefined, NOW2)).rejects.toThrow(/KINDLE_RSS_URL/);
    });
});
