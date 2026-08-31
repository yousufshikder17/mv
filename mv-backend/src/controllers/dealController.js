import { and, eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { mediaItems, dealVotes } from '../db/schema.js';
import { listDeals, dealPlatforms } from '../services/dealService.js';
import { buildDealFeed } from '../services/dealFeed.js';

const intOrNull = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
};

/**
 * GET /deals - the public deal feed.
 *
 * No account. A deal is a link: you look at it and click through to the store,
 * and there is nothing to sign up for. Consistent with M3 - the gate is
 * persistence, not access - so only voting below needs a session.
 */
export const getDeals = async (req, res) => {
    const { q, type, platform, sort } = req.query;
    const minDiscount = intOrNull(req.query.minDiscount) ?? 0;
    const maxPrice = intOrNull(req.query.maxPrice);
    const expiring = req.query.expiring === 'true' ? 24 : intOrNull(req.query.expiringWithinHours);

    const deals = await listDeals({
        q: q || null,
        type: type || null,
        platform: platform || null,
        minDiscount,
        // Query strings carry whole currency units; everything downstream is
        // integer cents.
        maxPriceCents: maxPrice != null ? maxPrice * 100 : null,
        expiringWithinHours: expiring,
        sort: sort || 'score',
    });

    return res.status(200).json({ status: 'Success', results: deals.length, data: { deals } });
};

/** GET /deals/platforms - the stores currently represented, for the filter. */
export const getDealPlatforms = async (req, res) => {
    const platforms = await dealPlatforms();
    return res.status(200).json({ status: 'Success', data: { platforms } });
};

/**
 * GET /deals/rss - the same feed as XML.
 *
 * Deliberately carries prices and store links only. SPEC 8: a machine-readable
 * feed consumed by other services is much closer to redistribution than a
 * rendered page, and RAWG forbids republishing their catalogue.
 */
export const getDealsRss = async (req, res) => {
    const xml = await buildDealFeed({
        type: req.query.type || null,
        minDiscount: intOrNull(req.query.minDiscount) ?? 0,
        siteUrl: `${req.protocol}://${req.get('host')}`,
    });

    res.type('application/rss+xml');
    return res.status(200).send(xml);
};

/**
 * POST /deals/:mediaItemId/vote { value }
 *
 * The one gated action. Upsert on (user, item): a second vote is a change of
 * mind rather than a second endorsement.
 */
export const voteOnDeal = async (req, res) => {
    const value = req.body?.value === -1 ? -1 : 1;

    const [item] = await db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(eq(mediaItems.id, req.params.mediaItemId))
        .limit(1);

    if (!item) return res.status(404).json({ error: 'Item not found' });

    const [vote] = await db
        .insert(dealVotes)
        .values({ userId: req.user.id, mediaItemId: item.id, value })
        .onConflictDoUpdate({
            target: [dealVotes.userId, dealVotes.mediaItemId],
            set: { value },
        })
        .returning();

    return res.status(200).json({ status: 'Success', data: { vote } });
};

/** DELETE /deals/:mediaItemId/vote - withdraw a vote entirely. */
export const removeVote = async (req, res) => {
    await db
        .delete(dealVotes)
        .where(and(
            eq(dealVotes.userId, req.user.id),
            eq(dealVotes.mediaItemId, req.params.mediaItemId),
        ));

    return res.status(200).json({ status: 'Success' });
};
