import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from '../src/config/db.js';
import { priceQuotes, priceAlerts } from '../src/db/schema.js';
import { api, createSchema, resetTables, registerUser, createMovie } from './helpers/testDb.js';
import {
    shouldNotify,
    evaluateAlerts,
    markNotified,
    MAX_ALERTS_PER_USER,
} from '../src/services/alertService.js';

beforeAll(createSchema);
beforeEach(resetTables);

const alert = (over = {}) => ({
    active: true, thresholdCents: 2000, lastNotifiedCents: null, ...over,
});

const quoteFor = (mediaItemId, priceCents, over = {}) => db.insert(priceQuotes).values({
    mediaItemId,
    source: 'itad',
    externalId: 'x' + Math.random().toString(36).slice(2, 8),
    platform: 'Steam',
    priceCents,
    currency: 'USD',
    url: 'https://example.test',
    quoteDate: '2026-08-31',
    ...over,
});

// The whole feature lives or dies on NOT sending. A month-long sale that
// emails every morning is a feature people mute, and a muted alert is worth
// less than no alert at all.
describe('shouldNotify', () => {
    it('fires the first time a price is at or below the threshold', () => {
        expect(shouldNotify(alert(), 1999)).toBe(true);
        expect(shouldNotify(alert(), 2000)).toBe(true);
    });

    it('stays silent above the threshold', () => {
        expect(shouldNotify(alert(), 2001)).toBe(false);
    });

    it('does not fire again for the same price on a later day', () => {
        // The sale lasts a month. One email, not thirty.
        expect(shouldNotify(alert({ lastNotifiedCents: 1500 }), 1500)).toBe(false);
    });

    it('does not fire for a price worse than the one already sent', () => {
        expect(shouldNotify(alert({ lastNotifiedCents: 1000 }), 1500)).toBe(false);
    });

    it('fires again when it drops further', () => {
        // A better deal is genuinely new information.
        expect(shouldNotify(alert({ lastNotifiedCents: 1500 }), 999)).toBe(true);
    });

    it('stays silent while paused, without losing the threshold', () => {
        expect(shouldNotify(alert({ active: false }), 1)).toBe(false);
    });

    it('handles a free game, which is the point of a zero threshold', () => {
        expect(shouldNotify(alert({ thresholdCents: 0 }), 0)).toBe(true);
    });
});

describe('evaluateAlerts', () => {
    const setup = async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg', title: 'Elden Ring' });
        return { user, game };
    };

    it('returns who to tell, without sending anything', async () => {
        const { user, game } = await setup();
        await db.insert(priceAlerts).values({ userId: user.id, mediaItemId: game.id, thresholdCents: 2000 });
        await quoteFor(game.id, 1499);

        const due = await evaluateAlerts();

        expect(due).toHaveLength(1);
        expect(due[0]).toMatchObject({ email: user.email, title: 'Elden Ring', priceCents: 1499 });
    });

    it('uses the cheapest quote when stores disagree', async () => {
        const { user, game } = await setup();
        await db.insert(priceAlerts).values({ userId: user.id, mediaItemId: game.id, thresholdCents: 2000 });
        await quoteFor(game.id, 1899, { externalId: 'steam' });
        await quoteFor(game.id, 1299, { externalId: 'gog' });

        const [due] = await evaluateAlerts();
        expect(due.priceCents).toBe(1299);
    });

    it('evaluates a shared item once per watcher, not once per quote', async () => {
        // 500 people watching one game is one item to price, not 500. SPEC 7
        // calls per-item dedup the single most important cost property.
        const { game } = await setup();
        const a = await registerUser();
        const b = await registerUser();
        await db.insert(priceAlerts).values([
            { userId: a.id, mediaItemId: game.id, thresholdCents: 2000 },
            { userId: b.id, mediaItemId: game.id, thresholdCents: 1000 },
        ]);
        await quoteFor(game.id, 1499);

        const due = await evaluateAlerts();
        // Only the watcher whose threshold it actually met.
        expect(due).toHaveLength(1);
        expect(due[0].email).toBe(a.email);
    });

    it('ignores a paused alert', async () => {
        const { user, game } = await setup();
        await db.insert(priceAlerts).values({
            userId: user.id, mediaItemId: game.id, thresholdCents: 9999, active: false,
        });
        await quoteFor(game.id, 100);

        expect(await evaluateAlerts()).toHaveLength(0);
    });

    it('is quiet when there is no quote for the item at all', async () => {
        const { user, game } = await setup();
        await db.insert(priceAlerts).values({ userId: user.id, mediaItemId: game.id, thresholdCents: 9999 });
        expect(await evaluateAlerts()).toHaveLength(0);
    });

    it('does not repeat after markNotified', async () => {
        const { user, game } = await setup();
        await db.insert(priceAlerts).values({ userId: user.id, mediaItemId: game.id, thresholdCents: 2000 });
        await quoteFor(game.id, 1499);

        const [first] = await evaluateAlerts();
        await markNotified(first.alertId, first.priceCents);

        expect(await evaluateAlerts()).toHaveLength(0);
    });
});

describe('alert endpoints', () => {
    it('creates, lists, pauses and deletes', async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });

        const created = await user.auth(api().post('/alerts')).send({ mediaItemId: game.id, thresholdCents: 1999 });
        expect(created.status).toBe(201);
        const id = created.body.data.alert.id;

        const listed = await user.auth(api().get('/alerts'));
        expect(listed.body.results).toBe(1);
        expect(listed.body.limit).toBe(MAX_ALERTS_PER_USER);

        const paused = await user.auth(api().patch(`/alerts/${id}`)).send({ active: false });
        expect(paused.body.data.alert.active).toBe(false);

        expect((await user.auth(api().delete(`/alerts/${id}`))).status).toBe(200);
        expect((await user.auth(api().get('/alerts'))).body.results).toBe(0);
    });

    it('treats a second threshold on the same item as an edit', async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });

        await user.auth(api().post('/alerts')).send({ mediaItemId: game.id, thresholdCents: 3000 });
        const second = await user.auth(api().post('/alerts')).send({ mediaItemId: game.id, thresholdCents: 1500 });

        expect(second.status).toBe(200);
        const listed = await user.auth(api().get('/alerts'));
        expect(listed.body.results).toBe(1);
        expect(listed.body.data.alerts[0].thresholdCents).toBe(1500);
    });

    it('clears the notified marks when the threshold changes', async () => {
        // Lowering a threshold is a new question. Keeping the old marks would
        // silence the alert the user just sharpened.
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        const created = await user.auth(api().post('/alerts')).send({ mediaItemId: game.id, thresholdCents: 3000 });
        await markNotified(created.body.data.alert.id, 2500);

        await user.auth(api().post('/alerts')).send({ mediaItemId: game.id, thresholdCents: 2000 });

        const listed = await user.auth(api().get('/alerts'));
        expect(listed.body.data.alerts[0].lastNotifiedCents).toBeNull();
    });

    it('enforces the per-user cap as a cost control', async () => {
        const user = await registerUser();
        const items = [];
        for (let i = 0; i < MAX_ALERTS_PER_USER; i++) items.push(await createMovie({ type: 'game', source: 'rawg' }));
        await db.insert(priceAlerts).values(
            items.map((m) => ({ userId: user.id, mediaItemId: m.id, thresholdCents: 1000 })),
        );

        const extra = await createMovie({ type: 'game', source: 'rawg' });
        const res = await user.auth(api().post('/alerts')).send({ mediaItemId: extra.id, thresholdCents: 1000 });

        expect(res.status).toBe(400);
        // Not a paywall (SPEC 7) - the message must not imply an upgrade path.
        expect(res.body.error).not.toMatch(/upgrade|premium|paid/i);
    });

    it('still lets an existing alert be edited at the cap', async () => {
        const user = await registerUser();
        const items = [];
        for (let i = 0; i < MAX_ALERTS_PER_USER; i++) items.push(await createMovie({ type: 'game', source: 'rawg' }));
        await db.insert(priceAlerts).values(
            items.map((m) => ({ userId: user.id, mediaItemId: m.id, thresholdCents: 1000 })),
        );

        const res = await user.auth(api().post('/alerts')).send({ mediaItemId: items[0].id, thresholdCents: 500 });
        expect(res.status).toBe(200);
    });

    it('rejects a threshold that is not whole cents', async () => {
        const user = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        const res = await user.auth(api().post('/alerts')).send({ mediaItemId: game.id, thresholdCents: 19.99 });
        expect(res.status).toBe(400);
    });

    it('404s an item that does not exist', async () => {
        const user = await registerUser();
        const res = await user.auth(api().post('/alerts'))
            .send({ mediaItemId: '00000000-0000-0000-0000-000000000000', thresholdCents: 100 });
        expect(res.status).toBe(404);
    });
});

describe('alert privacy (SPEC 9: always private)', () => {
    it('never lists alerts belonging to another user', async () => {
        const alice = await registerUser();
        const bob = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        await alice.auth(api().post('/alerts')).send({ mediaItemId: game.id, thresholdCents: 1000 });

        expect((await bob.auth(api().get('/alerts'))).body.results).toBe(0);
    });

    it('refuses to pause or delete an alert owned by someone else', async () => {
        const alice = await registerUser();
        const mallory = await registerUser();
        const game = await createMovie({ type: 'game', source: 'rawg' });
        const created = await alice.auth(api().post('/alerts')).send({ mediaItemId: game.id, thresholdCents: 1000 });
        const id = created.body.data.alert.id;

        // 404 rather than 403 - a different answer would confirm it exists.
        expect((await mallory.auth(api().patch(`/alerts/${id}`)).send({ active: false })).status).toBe(404);
        expect((await mallory.auth(api().delete(`/alerts/${id}`))).status).toBe(404);
    });

    it('requires an account at all', async () => {
        expect((await api().get('/alerts')).status).toBe(401);
        expect((await api().post('/alerts').send({})).status).toBe(401);
    });
});
