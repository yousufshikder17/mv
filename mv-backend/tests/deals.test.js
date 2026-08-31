import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from '../src/config/db.js';
import { priceQuotes, dealVotes } from '../src/db/schema.js';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';
import { dealScore, dealReason, listDeals } from '../src/services/dealService.js';
import { dealsToRss } from '../src/services/dealFeed.js';

beforeAll(createSchema);
beforeEach(resetTables);

const today = new Date().toISOString().slice(0, 10);

// Store names are real ones ITAD returned for this game. Fixtures that
// contradict reality mislead whoever reads the test next.
const quote = (mediaItemId, over = {}) => db.insert(priceQuotes).values({
    mediaItemId,
    source: 'itad',
    externalId: 'q' + Math.random().toString(36).slice(2, 9),
    platform: 'GameBillet',
    priceCents: 2995,
    currency: 'USD',
    url: 'https://store.test/x',
    quoteDate: today,
    ...over,
});

// Discount alone is a poor signal: a permanent 30% off something that is
// always 30% off is not news. What makes a deal is the price against what the
// item has actually sold for - ITAD's historical lows, which SPEC 7 says to
// query rather than accumulate.
describe('deal scoring uses history, not just discount', () => {
    it('scores an all-time low at 100', () => {
        expect(dealScore({ priceCents: 2995, originalPriceCents: 5999, discountPercent: 50, historyLowCents: 2995 })).toBe(100);
    });

    it('scores a big discount far above the historical low poorly', () => {
        // 40% off means little if it has been half that price before.
        const deep = dealScore({ priceCents: 4000, originalPriceCents: 6666, discountPercent: 40, historyLowCents: 1500 });
        const atLow = dealScore({ priceCents: 1500, originalPriceCents: 2000, discountPercent: 25, historyLowCents: 1500 });
        expect(atLow).toBeGreaterThan(deep);
    });

    it('falls back to raw discount when history is unknown', () => {
        // A newly tracked item should still appear rather than scoring zero
        // for lacking data we have not collected yet.
        expect(dealScore({ priceCents: 5000, originalPriceCents: 10000, discountPercent: 50 })).toBe(50);
    });

    it('never exceeds 100', () => {
        expect(dealScore({ priceCents: 100, originalPriceCents: 99999, discountPercent: 99, historyLowCents: 5000 })).toBeLessThanOrEqual(100);
    });
});

describe('every deal explains itself', () => {
    it.each([
        [{ priceCents: 2995, historyLowCents: 2995 }, 'Lowest price ever'],
        [{ priceCents: 3000, historyLowCents: 2000, historyLow1yCents: 3000 }, 'Lowest in a year'],
        [{ priceCents: 3000, historyLowCents: 2000, historyLow3mCents: 3000 }, 'Lowest in three months'],
        [{ priceCents: 3000, discountPercent: 40 }, '40% off'],
        [{ priceCents: 3000, discountPercent: 0 }, 'Currently available'],
    ])('describes a deal as %s', (deal, expected) => {
        expect(dealReason(deal)).toBe(expected);
    });
});

describe('the feed', () => {
    it('shows one row per item, at its cheapest store', async () => {
        // On sale at three stores is one deal, not three entries competing
        // for the same slot in a feed.
        const game = await createMovie({ type: 'game', source: 'rawg', title: 'Elden Ring' });
        await quote(game.id, { priceCents: 5159, platform: 'GameBillet' });
        await quote(game.id, { priceCents: 3299, platform: 'Fanatical' });
        await quote(game.id, { priceCents: 5388, platform: 'GamesPlanet US' });

        const deals = await listDeals();
        expect(deals).toHaveLength(1);
        expect(deals[0].platform).toBe('Fanatical');
        expect(deals[0].priceCents).toBe(3299);
    });

    it('excludes stale quotes', async () => {
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await quote(game.id, { quoteDate: '2020-01-01' });
        expect(await listDeals()).toHaveLength(0);
    });

    it('excludes quotes with no catalogue row', async () => {
        // Book seed volumes are polled before anyone tracks them, so they
        // carry no mediaItemId and cannot be shown as a deal on an item.
        await quote(null);
        expect(await listDeals()).toHaveLength(0);
    });

    it('filters by type, discount and price', async () => {
        const game = await createMovie({ type: 'game', source: 'rawg' });
        const film = await createMovie({ type: 'film', source: 'tmdb' });
        await quote(game.id, { priceCents: 1000, discountPercent: 60 });
        await quote(film.id, { priceCents: 9000, discountPercent: 10 });

        expect(await listDeals({ type: 'game' })).toHaveLength(1);
        expect(await listDeals({ minDiscount: 50 })).toHaveLength(1);
        expect(await listDeals({ maxPriceCents: 5000 })).toHaveLength(1);
    });

    it('searches by title within the deals that exist', async () => {
        // Searching deals means searching what is actually on sale, not the
        // whole catalogue - a result you cannot buy is not a deal.
        const a = await createMovie({ type: 'game', source: 'rawg', title: 'Hollow Knight' });
        const b = await createMovie({ type: 'game', source: 'rawg', title: 'Celeste' });
        await quote(a.id);
        await quote(b.id);

        expect((await listDeals({ q: 'hollow' })).map((d) => d.title)).toEqual(['Hollow Knight']);
        expect(await listDeals({ q: 'CELESTE' })).toHaveLength(1);
        expect(await listDeals({ q: 'nothing here' })).toHaveLength(0);
    });

    it('searches after picking the cheapest store, not before', async () => {
        // Filtering in SQL would run before the cheapest-store pass and could
        // drop the very row that survives it.
        const game = await createMovie({ type: 'game', source: 'rawg', title: 'Subnautica' });
        await quote(game.id, { priceCents: 2000, platform: 'Steam' });
        await quote(game.id, { priceCents: 749, platform: 'Humble Store' });

        const [deal] = await listDeals({ q: 'subnautica' });
        expect(deal.priceCents).toBe(749);
    });

    it('ranks an all-time low above a bigger raw discount', async () => {
        const atLow = await createMovie({ type: 'game', source: 'rawg', title: 'At low', historyLowCents: 2000 });
        const bigCut = await createMovie({ type: 'game', source: 'rawg', title: 'Big cut', historyLowCents: 500 });
        await quote(atLow.id, { priceCents: 2000, discountPercent: 20 });
        await quote(bigCut.id, { priceCents: 4000, discountPercent: 60 });

        expect((await listDeals({ sort: 'score' }))[0].title).toBe('At low');
    });
});

describe('expiring soon', () => {
    it('includes only sales actually ending within the window', async () => {
        const soon = await createMovie({ type: 'game', source: 'rawg', title: 'Soon' });
        const later = await createMovie({ type: 'game', source: 'rawg', title: 'Later' });
        const undated = await createMovie({ type: 'game', source: 'rawg', title: 'Undated' });

        await quote(soon.id, { saleEnds: new Date(Date.now() + 6 * 3600000) });
        await quote(later.id, { saleEnds: new Date(Date.now() + 96 * 3600000) });
        await quote(undated.id, { saleEnds: null });

        expect((await listDeals({ expiringWithinHours: 24 })).map((d) => d.title)).toEqual(['Soon']);
    });

    it('excludes a sale that already ended', async () => {
        // An expired deal in an "ending soon" list is worse than none.
        const past = await createMovie({ type: 'game', source: 'rawg' });
        await quote(past.id, { saleEnds: new Date(Date.now() - 3600000) });
        expect(await listDeals({ expiringWithinHours: 24 })).toHaveLength(0);
    });
});

describe('voting', () => {
    it('is the only thing here that needs an account', async () => {
        // Browsing a deal is looking at a link. There is nothing to sign up
        // for, so only the write is gated (M3: persistence, not access).
        expect((await api().get('/deals')).status).toBe(200);
        expect((await api().get('/deals/rss')).status).toBe(200);
        expect((await api().post('/deals/x/vote').send({ value: 1 })).status).toBe(401);
    });

    it('treats a second vote as a change of mind', async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await quote(game.id);

        await user.auth(api().post('/deals/' + game.id + '/vote')).send({ value: 1 });
        await user.auth(api().post('/deals/' + game.id + '/vote')).send({ value: -1 });

        expect(await db.select().from(dealVotes)).toHaveLength(1);
        expect((await listDeals())[0].votes).toBe(-1);
    });

    it('counts votes from different people', async () => {
        const a = await registerUser();
        const b = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await quote(game.id);

        await a.auth(api().post('/deals/' + game.id + '/vote')).send({ value: 1 });
        await b.auth(api().post('/deals/' + game.id + '/vote')).send({ value: 1 });

        expect((await listDeals())[0].votes).toBe(2);
    });

    it('lets a vote be withdrawn', async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await quote(game.id);
        await user.auth(api().post('/deals/' + game.id + '/vote')).send({ value: 1 });

        await user.auth(api().delete('/deals/' + game.id + '/vote'));
        expect((await listDeals())[0].votes).toBe(0);
    });

    it('404s a vote on an item that does not exist', async () => {
        const user = await registerUser();
        const res = await user.auth(api().post('/deals/00000000-0000-0000-0000-000000000000/vote')).send({ value: 1 });
        expect(res.status).toBe(404);
    });

    it('does not let popularity outrank quality', async () => {
        // A well-liked mediocre deal must not beat an all-time low.
        const user = await registerUser();
        const meh = await createMovie({ type: 'game', source: 'rawg', title: 'Meh', historyLowCents: 500 });
        const great = await createMovie({ type: 'game', source: 'rawg', title: 'Great', historyLowCents: 2000 });
        await quote(meh.id, { priceCents: 4000, discountPercent: 10 });
        await quote(great.id, { priceCents: 2000, discountPercent: 20 });
        await user.auth(api().post('/deals/' + meh.id + '/vote')).send({ value: 1 });

        expect((await listDeals({ sort: 'score' }))[0].title).toBe('Great');
    });
});

// SPEC 8: the feed may carry prices and store links, and may NOT republish
// RAWG's catalogue. A machine-readable feed consumed by other services is far
// closer to redistribution than a rendered page showing a cover to a visitor.
describe('RSS carries prices, never provider metadata', () => {
    const deal = {
        mediaItemId: 'abc', title: 'Elden Ring', priceCents: 2995,
        originalPriceCents: 5999, discountPercent: 50, currency: 'USD',
        platform: 'GameBillet', url: 'https://gamebillet.test/x',
        quoteDate: '2026-08-31', reason: 'Lowest price ever',
        // Present on the object, and must not reach the feed.
        posterUrl: 'https://media.rawg.io/cover.jpg',
        overview: 'A vast fantasy world.',
        genres: ['Action', 'RPG'],
    };

    it('includes the price, the store and the link', () => {
        const xml = dealsToRss([deal]);
        expect(xml).toContain('$29.95');
        expect(xml).toContain('GameBillet');
        expect(xml).toContain('https://gamebillet.test/x');
        expect(xml).toContain('Lowest price ever');
    });

    it('excludes cover art, description and genres', () => {
        const xml = dealsToRss([deal]);
        expect(xml).not.toContain('media.rawg.io');
        expect(xml).not.toContain('A vast fantasy world');
        expect(xml).not.toContain('RPG');
    });

    it('links to the store rather than back to us', () => {
        // The point of the feed is the deal, not traffic.
        const xml = dealsToRss([deal], { siteUrl: 'https://mv.test' });
        expect(xml).toContain('<link>https://gamebillet.test/x</link>');
    });

    it('escapes titles so a quote cannot break the document', () => {
        const xml = dealsToRss([{ ...deal, title: 'Tom & Jerry <b>Deal</b>' }]);
        expect(xml).not.toContain('<b>');
        expect(xml).toContain('&amp;');
    });

    it('produces a valid empty feed when nothing is on sale', () => {
        const xml = dealsToRss([]);
        expect(xml).toContain('<rss version="2.0">');
        expect(xml).toContain('</rss>');
        expect(xml).not.toContain('<item>');
    });
});
