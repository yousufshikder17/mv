import 'dotenv/config';
import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { notifications, pushSubscriptions } from '../db/schema.js';

/**
 * Delivery for alerts. One seam, three channels.
 *
 * The in-app notification is written FIRST and unconditionally. Email and push
 * decorate a row that already exists, so if the mail provider is down or the
 * browser never granted permission, the news is still waiting in the app - the
 * one outcome worth avoiding is a price drop nobody ever hears about.
 *
 * evaluateAlerts deliberately returns who to tell rather than telling them,
 * which is what lets this file exist separately and be swapped without
 * touching the decision logic.
 */

const money = (cents, currency = 'USD') => {
    const symbol = { USD: '$', GBP: '\u00a3', EUR: '\u20ac' }[currency] ?? '';
    return `${symbol}${(cents / 100).toFixed(2)}`;
};

/** The one place the wording lives, so all three channels agree. */
export const composeAlert = (due) => ({
    type: 'price_drop',
    title: `${due.title} is ${money(due.priceCents, due.currency)}`,
    body: `Now ${money(due.priceCents, due.currency)}, below your ${money(due.thresholdCents, due.currency)} alert.`,
    url: `/media/game/${due.mediaItemId}`,
});

// ── Channel: in-app ──────────────────────────────────────────────────
// Always runs. This is the record that the thing was announced at all.
const deliverInApp = async (userId, message, mediaItemId) => {
    const [row] = await db
        .insert(notifications)
        .values({ userId, mediaItemId, ...message })
        .returning();
    return row;
};

// ── Channel: email ───────────────────────────────────────────────────
const deliverEmail = async (to, message) => {
    const key = process.env.RESEND_API_KEY;
    // No key is "not configured yet", not a failure - the same way the Kindle
    // adapter stays dormant until a feed exists.
    if (!key) return { skipped: 'email not configured' };

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: process.env.ALERT_FROM_EMAIL ?? 'onboarding@resend.dev',
            to,
            subject: message.title,
            text: `${message.body}\n\nSee it: ${process.env.PUBLIC_URL ?? ''}${message.url}`,
        }),
    });

    if (!res.ok) throw new Error(`email failed (${res.status})`);
    return { sent: true };
};

// ── Channel: web push ────────────────────────────────────────────────
let vapidReady = false;
const configurePush = () => {
    if (vapidReady) return true;
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
    webpush.setVapidDetails(VAPID_SUBJECT ?? 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidReady = true;
    return true;
};

const deliverPush = async (userId, message) => {
    if (!configurePush()) return { skipped: 'push not configured' };

    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    if (!subs.length) return { skipped: 'no subscriptions' };

    let sent = 0;
    for (const sub of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify(message),
            );
            sent += 1;
        } catch (err) {
            // 404/410 means the browser threw the subscription away - the user
            // cleared site data or uninstalled. Keeping it means retrying a
            // dead endpoint every single day forever.
            if (err.statusCode === 404 || err.statusCode === 410) {
                await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
            }
        }
    }
    return { sent };
};

/**
 * Sends one due alert everywhere.
 *
 * Channels are independent on purpose: a failing email must not cost the push,
 * and neither can prevent the in-app record. Returns per-channel outcomes so
 * the poll summary can say what actually happened.
 */
export const notify = async (due) => {
    const message = composeAlert(due);
    const result = { inApp: false, email: null, push: null };

    // First and unconditional. If everything else fails, this still landed.
    await deliverInApp(due.userId, message, due.mediaItemId);
    result.inApp = true;

    const [email, push] = await Promise.allSettled([
        deliverEmail(due.email, message),
        deliverPush(due.userId, message),
    ]);

    result.email = email.status === 'fulfilled' ? email.value : { error: email.reason.message };
    result.push = push.status === 'fulfilled' ? push.value : { error: push.reason.message };
    return result;
};
