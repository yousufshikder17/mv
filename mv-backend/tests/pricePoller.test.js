import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../src/config/db.js';
import { mediaItems, trackingItems, priceAlerts } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';
import { watchedGames, resolveItadIds, pollGamePrices } from '../src/services/pricePoller.js';
import { resetRateLimit } from '../src/adapters/price/itad.js';

beforeAll(createSchema);
beforeEach(async () => { await resetTables(); resetRateLimit(); process.env.ITAD_API_KEY ||= 'test-key'; });
afterEach(() => vi.unstubAllGlobals());

const track = (userId, mediaItemId) => db.insert(trackingItems).values({ userId, mediaItemId });
const alertOn = (userId, mediaItemId) =>
    db.insert(priceAlerts).values({ userId, mediaItemId, thresholdCents: 5000 });

// SPEC 7 calls this "the single most important cost property of the system":
// polling deduplicates by ITEM, not by user. If 500 people watch Elden Ring it
// is polled once. Letting per-user polling creep in is the failure these
// tests exist to catch.
describe('polling deduplicates by item, not by user', () => {
    it('returns one row for a game a hundred people track', async () => {
        const game = await createMovie({ type: 'game', source: 'rawg', title: 'Elden Ring' });
        for (let i = 0; i < 5; i++) {
            const u = await registerUser();
            await track(u.id, game.id);
        }

        const games = await watchedGames();
        expect(games).toHaveLength(1);
        expect(games[0].title).toBe('Elden Ring');
    });

    it('counts a game once when the same user tracks AND alerts on it', async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await track(user.id, game.id);
        await alertOn(user.id, game.id);

        expect(await watchedGames()).toHaveLength(1);
    });

    it('includes a game that only has an alert, with nobody tracking it', async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await alertOn(user.id, game.id);

        expect(await watchedGames()).toHaveLength(1);
    });

    it('ignores games nobody watches at all', async () => {
        await createMovie({ type: 'game', source: 'rawg' });
        expect(await watchedGames()).toHaveLength(0);
    });

    it('ignores films and shows - ITAD prices games', async () => {
        const user = await registerUser();
        const film = await createMovie({ type: 'film', source: 'tmdb' });
        await track(user.id, film.id);

        expect(await watchedGames()).toHaveLength(0);
    });
});

describe('ITAD ids are resolved once, not every poll', () => {
    it('looks a game up and remembers the id', async () => {
        const game = await createMovie({ type: 'game', source: 'rawg', title: 'Elden Ring' });
        const spy = vi.fn(async () => ({
            ok: true, status: 200, headers: { get: () => null },
            json: async () => ({ found: true, game: { id: 'itad-1' } }),
        }));
        vi.stubGlobal('fetch', spy);

        await resolveItadIds([{ id: game.id, title: 'Elden Ring', itadId: null }]);

        const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, game.id));
        expect(row.itadId).toBe('itad-1');
    });

    it('does not look up a game that already has an id', async () => {
        const spy = vi.fn();
        vi.stubGlobal('fetch', spy);

        const out = await resolveItadIds([{ id: 'm', title: 'X', itadId: 'known' }]);

        expect(spy).not.toHaveBeenCalled();
        expect(out).toHaveLength(1);
    });

    it('drops a game ITAD does not carry instead of failing the poll', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true, status: 200, headers: { get: () => null },
            json: async () => ({ found: false }),
        })));

        expect(await resolveItadIds([{ id: 'm', title: 'Obscure', itadId: null }])).toHaveLength(0);
    });
});

describe('pollGamePrices', () => {
    const stubPrices = (deals) => vi.stubGlobal('fetch', vi.fn(async (url) => ({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => String(url).includes('lookup')
            ? { found: true, game: { id: 'itad-1' } }
            : [{ id: 'itad-1', deals, historyLow: null }],
    })));

    it('turns watched games into quotes attached to our own item id', async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg', title: 'Elden Ring' });
        await track(user.id, game.id);
        stubPrices([{ shop: { id: 20, name: 'GameBillet' }, price: { amountInt: 5159 },
            regular: { amountInt: 5999 }, cut: 14, url: 'https://a.test' }]);

        const { quotes, polled, errors } = await pollGamePrices();

        expect(errors).toEqual([]);
        expect(polled).toBe(1);
        expect(quotes).toHaveLength(1);
        expect(quotes[0]).toMatchObject({ mediaItemId: game.id, priceCents: 5159, source: 'itad' });
    });

    it('does nothing at all when nobody is watching a game', async () => {
        const spy = vi.fn();
        vi.stubGlobal('fetch', spy);

        const { quotes, polled } = await pollGamePrices();

        expect(quotes).toEqual([]);
        expect(polled).toBe(0);
        expect(spy).not.toHaveBeenCalled();
    });

    it('stops the whole run on a 429 rather than pressing on', async () => {
        // Continuing after a 429 is precisely the "working around limits"
        // their terms treat as ban-worthy.
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg', itadId: 'itad-1' });
        await track(user.id, game.id);

        const spy = vi.fn(async () => ({ ok: false, status: 429, headers: { get: () => '600' } }));
        vi.stubGlobal('fetch', spy);

        const { quotes, errors } = await pollGamePrices();

        expect(quotes).toEqual([]);
        expect(errors[0]).toMatch(/rate limited/i);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
