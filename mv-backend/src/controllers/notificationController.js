import { and, eq, desc, isNull, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { notifications, pushSubscriptions } from '../db/schema.js';

/** GET /notifications - this user inbox, newest first. */
export const listNotifications = async (req, res) => {
    const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(50);

    const [{ unread }] = await db
        .select({ unread: sql`count(*)`.mapWith(Number) })
        .from(notifications)
        .where(and(eq(notifications.userId, req.user.id), isNull(notifications.readAt)));

    return res.status(200).json({
        status: 'Success',
        results: rows.length,
        unread,
        data: { notifications: rows },
    });
};

/** POST /notifications/read { id } - or all of them when id is absent. */
export const markRead = async (req, res) => {
    const now = new Date();
    const where = req.body?.id
        ? and(eq(notifications.userId, req.user.id), eq(notifications.id, req.body.id))
        : and(eq(notifications.userId, req.user.id), isNull(notifications.readAt));

    const updated = await db
        .update(notifications)
        .set({ readAt: now })
        .where(where)
        .returning({ id: notifications.id });

    return res.status(200).json({ status: 'Success', updated: updated.length });
};

/**
 * GET /notifications/vapid-key - the PUBLIC key, for the browser to subscribe.
 *
 * Public by design: it is the half of the pair meant to be handed out, and the
 * client cannot subscribe without it. The private key never leaves the server.
 */
export const vapidKey = async (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: 'Push is not configured' });
    return res.status(200).json({ status: 'Success', data: { publicKey: key } });
};

/**
 * POST /notifications/subscribe - registers one browser for push.
 *
 * Upsert on the endpoint: re-subscribing the same browser must replace the row
 * rather than accumulate duplicates that all buzz at once. A person with a
 * laptop and a phone legitimately has two.
 */
export const subscribePush = async (req, res) => {
    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Invalid push subscription' });
    }

    const [sub] = await db
        .insert(pushSubscriptions)
        .values({ userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
        .onConflictDoUpdate({
            target: pushSubscriptions.endpoint,
            // Reassigns the endpoint if a different account signs in on the
            // same browser - otherwise the previous user keeps getting buzzed.
            set: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
        })
        .returning({ id: pushSubscriptions.id });

    return res.status(201).json({ status: 'Success', data: { id: sub.id } });
};

/** DELETE /notifications/subscribe - unsubscribes this browser. */
export const unsubscribePush = async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });

    await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, req.user.id), eq(pushSubscriptions.endpoint, endpoint)));

    return res.status(200).json({ status: 'Success' });
};
