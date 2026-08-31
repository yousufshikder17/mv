import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { priceAlerts, priceQuotes, mediaItems, users } from '../db/schema.js';

/**
 * Price alert evaluation.
 *
 * Deliberately knows nothing about ITAD, Google Books, or email. It takes
 * quotes and alerts and decides who should be told - which is the part worth
 * testing, and the part that must not change when a price source or a
 * delivery channel does.
 */

// SPEC §7: a cost control, NOT a paywall. ITAD and CamelCamelCamel both offer
// free alerts and free history; gating those would make this product worse
// than the free tools it wraps and send people straight back to them. The
// number exists only so one account cannot set 5,000 alerts and torch the
// polling budget.
export const MAX_ALERTS_PER_USER = 100;

/**
 * Should this alert fire for this price?
 *
 * Exported and pure, because the interesting cases are all about NOT sending:
 * a month-long sale must notify once, not thirty times, and a paused alert
 * must stay silent while keeping its threshold.
 */
export const shouldNotify = (alert, priceCents) => {
    if (!alert.active) return false;
    if (priceCents > alert.thresholdCents) return false;

    // First time under the threshold.
    if (alert.lastNotifiedCents == null) return true;

    // Already told them about this price or better. Telling them again is how
    // a price alert becomes something people mute.
    return priceCents < alert.lastNotifiedCents;
};

/**
 * The cheapest quote per item from today's poll.
 *
 * Grouped by item rather than by user: if 500 people watch the same game it is
 * evaluated once. SPEC §7 calls per-item deduplication "the single most
 * important cost property of the system".
 */
export const cheapestQuotesFor = async (mediaItemIds, onDate) => {
    if (!mediaItemIds.length) return new Map();

    const rows = await db
        .select({
            mediaItemId: priceQuotes.mediaItemId,
            priceCents: sql`min(${priceQuotes.priceCents})`.mapWith(Number),
            currency: sql`min(${priceQuotes.currency})`,
        })
        .from(priceQuotes)
        .where(and(
            inArray(priceQuotes.mediaItemId, mediaItemIds),
            onDate ? eq(priceQuotes.quoteDate, onDate) : undefined,
        ))
        .groupBy(priceQuotes.mediaItemId);

    return new Map(rows.map((r) => [r.mediaItemId, r]));
};

/**
 * Evaluates every active alert and returns what should be sent.
 *
 * Returns rather than sends, so delivery is a separate decision - and so a
 * test can assert who would be told without an email server.
 */
export const evaluateAlerts = async ({ onDate = null } = {}) => {
    const alerts = await db
        .select({
            alert: priceAlerts,
            item: mediaItems,
            email: users.email,
            name: users.name,
        })
        .from(priceAlerts)
        .innerJoin(mediaItems, eq(priceAlerts.mediaItemId, mediaItems.id))
        .innerJoin(users, eq(priceAlerts.userId, users.id))
        .where(eq(priceAlerts.active, true));

    if (!alerts.length) return [];

    const quotes = await cheapestQuotesFor([...new Set(alerts.map((a) => a.alert.mediaItemId))], onDate);

    const due = [];
    for (const { alert, item, email, name } of alerts) {
        const quote = quotes.get(alert.mediaItemId);
        if (!quote) continue;
        if (!shouldNotify(alert, quote.priceCents)) continue;

        due.push({
            alertId: alert.id,
            userId: alert.userId,
            email,
            name,
            title: item.title,
            mediaItemId: item.id,
            priceCents: quote.priceCents,
            currency: quote.currency,
            thresholdCents: alert.thresholdCents,
        });
    }
    return due;
};

/**
 * Records that an alert was sent.
 *
 * Separate from evaluateAlerts so a delivery failure does not mark an alert
 * notified - the alternative is silently swallowing the one message the
 * feature exists to send.
 */
export const markNotified = async (alertId, priceCents, now = new Date()) => {
    await db
        .update(priceAlerts)
        .set({ lastNotifiedAt: now, lastNotifiedCents: priceCents })
        .where(eq(priceAlerts.id, alertId));
};
