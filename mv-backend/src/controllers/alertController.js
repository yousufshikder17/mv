import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { priceAlerts, mediaItems } from '../db/schema.js';
import { MAX_ALERTS_PER_USER } from '../services/alertService.js';

// Ownership follows the same pattern as the watchlist: the userId is in the
// WHERE, so someone else's alert matches no row and is indistinguishable from
// one that does not exist. SPEC §9 - price alerts are always private.

/** GET /alerts - this user's alerts, newest first. */
export const listAlerts = async (req, res) => {
    const rows = await db
        .select({ alert: priceAlerts, item: mediaItems })
        .from(priceAlerts)
        .leftJoin(mediaItems, eq(priceAlerts.mediaItemId, mediaItems.id))
        .where(eq(priceAlerts.userId, req.user.id))
        .orderBy(desc(priceAlerts.createdAt));

    const alerts = rows.map(({ alert, item }) => ({ ...alert, item }));
    return res.status(200).json({
        status: 'Success',
        results: alerts.length,
        // Surfaced so the UI can warn before the limit rather than after.
        limit: MAX_ALERTS_PER_USER,
        data: { alerts },
    });
};

/**
 * POST /alerts { mediaItemId, thresholdCents, currency }
 *
 * Upserts: setting a second threshold on the same item is an edit, not a
 * second alert. Changing the threshold clears the notified marks, so lowering
 * it can fire again on a price you were already told about.
 */
export const upsertAlert = async (req, res) => {
    const { mediaItemId, thresholdCents, currency = 'USD' } = req.body;

    const [item] = await db
        .select()
        .from(mediaItems)
        .where(eq(mediaItems.id, mediaItemId))
        .limit(1);

    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Counted before inserting, and only for a NEW alert - editing an existing
    // threshold must not be blocked by a limit the user is already at.
    const [existing] = await db
        .select()
        .from(priceAlerts)
        .where(and(eq(priceAlerts.userId, req.user.id), eq(priceAlerts.mediaItemId, mediaItemId)))
        .limit(1);

    if (!existing) {
        const [{ count }] = await db
            .select({ count: sql`count(*)`.mapWith(Number) })
            .from(priceAlerts)
            .where(eq(priceAlerts.userId, req.user.id));

        if (count >= MAX_ALERTS_PER_USER) {
            // A cost control, not a paywall (SPEC §7), so the message says so
            // rather than implying an upgrade exists.
            return res.status(400).json({
                error: `You can watch up to ${MAX_ALERTS_PER_USER} items. Remove one to add another.`,
            });
        }
    }

    const [alert] = await db
        .insert(priceAlerts)
        .values({ userId: req.user.id, mediaItemId, thresholdCents, currency })
        .onConflictDoUpdate({
            target: [priceAlerts.userId, priceAlerts.mediaItemId],
            set: {
                thresholdCents,
                currency,
                active: true,
                // A new threshold is a new question. Keeping the old marks
                // would silence an alert the user just lowered.
                lastNotifiedAt: null,
                lastNotifiedCents: null,
            },
        })
        .returning();

    return res.status(existing ? 200 : 201).json({ status: 'Success', data: { alert } });
};

/** PATCH /alerts/:id { active } - pause without losing the threshold. */
export const setAlertActive = async (req, res) => {
    const [alert] = await db
        .update(priceAlerts)
        .set({ active: Boolean(req.body.active) })
        .where(and(eq(priceAlerts.id, req.params.id), eq(priceAlerts.userId, req.user.id)))
        .returning();

    if (!alert) return res.status(404).json({ error: 'Alert not found or unauthorized' });
    return res.status(200).json({ status: 'Success', data: { alert } });
};

/** DELETE /alerts/:id */
export const removeAlert = async (req, res) => {
    const removed = await db
        .delete(priceAlerts)
        .where(and(eq(priceAlerts.id, req.params.id), eq(priceAlerts.userId, req.user.id)))
        .returning();

    if (!removed.length) return res.status(404).json({ error: 'Alert not found or unauthorized' });
    return res.status(200).json({ status: 'Success', message: 'Alert removed' });
};
