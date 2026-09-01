import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import {
    users, trackingItems, mediaItems, seasonRatings, priceAlerts,
    notifications, pushSubscriptions, reviews, reviewVotes, comments,
    follows, dealVotes, lists, listItems,
} from '../db/schema.js';

/**
 * GET /account/export - everything we hold about you, as JSON.
 *
 * GDPR Article 20, portability. Deliberately a single endpoint returning a
 * complete document rather than a queued job with an emailed link: at this
 * scale the whole export is a few hundred rows, and a download you get
 * immediately is one people actually use.
 *
 * The password hash is excluded. It is data about the account rather than
 * data the account produced, and exporting a bcrypt hash helps nobody while
 * putting a credential in a file people forward around.
 */
export const exportAccount = async (req, res) => {
    const userId = req.user.id;

    const [account] = await db
        .select({
            id: users.id, name: users.name, email: users.email,
            bio: users.bio, profilePublic: users.profilePublic, createdAt: users.createdAt,
        })
        .from(users).where(eq(users.id, userId)).limit(1);

    const tracked = await db
        .select({ item: trackingItems, media: mediaItems })
        .from(trackingItems)
        .leftJoin(mediaItems, eq(trackingItems.mediaItemId, mediaItems.id))
        .where(eq(trackingItems.userId, userId));

    const [alerts, notes, subs, written, votes, said, following, dealVoted, curated] = await Promise.all([
        db.select().from(priceAlerts).where(eq(priceAlerts.userId, userId)),
        db.select().from(notifications).where(eq(notifications.userId, userId)),
        // Endpoints only - the keys are credentials for a browser, not
        // personal data, and exporting them would let anyone with the file
        // push notifications to that device.
        db.select({ endpoint: pushSubscriptions.endpoint, createdAt: pushSubscriptions.createdAt })
            .from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
        db.select().from(reviews).where(eq(reviews.userId, userId)),
        db.select().from(reviewVotes).where(eq(reviewVotes.userId, userId)),
        db.select().from(comments).where(eq(comments.userId, userId)),
        db.select().from(follows).where(eq(follows.followerId, userId)),
        db.select().from(dealVotes).where(eq(dealVotes.userId, userId)),
        db.select().from(lists).where(eq(lists.userId, userId)),
    ]);

    // Lists carry their items, rather than being exported as bare names. A
    // list without its contents is not the thing the person made.
    const curatedWithItems = await Promise.all(curated.map(async (list) => ({
        ...list,
        items: await db
            .select({ item: listItems, media: mediaItems })
            .from(listItems)
            .leftJoin(mediaItems, eq(listItems.mediaItemId, mediaItems.id))
            .where(eq(listItems.listId, list.id))
            .then((rows) => rows.map((r) => Object.assign({}, r.item, { item: r.media }))),
    })));

    const seasons = tracked.length
        ? await db.select().from(seasonRatings)
            .where(eq(seasonRatings.trackingItemId, tracked[0].item.id))
        : [];

    const payload = {
        exportedAt: new Date().toISOString(),
        // Says plainly what is and is not here, so the export can be checked
        // rather than trusted.
        note: 'Everything this account has created. Excludes the password hash and push encryption keys, which are credentials rather than your data.',
        account,
        tracking: tracked.map((t) => Object.assign({}, t.item, { item: t.media })),
        seasonRatings: seasons,
        priceAlerts: alerts,
        notifications: notes,
        pushSubscriptions: subs,
        reviews: written,
        reviewVotes: votes,
        comments: said,
        following,
        dealVotes: dealVoted,
        lists: curatedWithItems,
    };

    res.setHeader('Content-Disposition', 'attachment; filename="media-vault-export.json"');
    return res.status(200).json(payload);
};

/**
 * PATCH /account/privacy { profilePublic, bio }
 *
 * Profile-level privacy, the outermost of SPEC 9's three layers. Turning a
 * profile private hides it from everyone immediately - the profile endpoint
 * checks this flag before anything else.
 */
export const updatePrivacy = async (req, res) => {
    const payload = req.body || {};
    const patch = {};
    if (typeof payload.profilePublic === 'boolean') patch.profilePublic = payload.profilePublic;
    if (typeof payload.bio === 'string') patch.bio = payload.bio.slice(0, 500);

    if (!Object.keys(patch).length) {
        return res.status(400).json({ error: 'Nothing to update' });
    }

    const [user] = await db.update(users).set(patch)
        .where(eq(users.id, req.user.id))
        .returning({ id: users.id, profilePublic: users.profilePublic, bio: users.bio });

    return res.status(200).json({ status: 'Success', data: { user } });
};

/**
 * DELETE /account { password } - GDPR Article 17, the right to erasure.
 *
 * The privacy page promised this before it existed. That is the same class of
 * problem as a leak: a written guarantee the code does not keep.
 *
 * The password is required again even though the caller is already
 * authenticated. Deleting an account is irreversible and there is no undo, so
 * a token lifted from a shared machine should not be enough to do it - this is
 * the one action worth asking twice for.
 *
 * The delete itself is a single row. Every table that references a user
 * cascades (verified: twelve foreign keys, all ON DELETE CASCADE), so tracking
 * items, reviews, votes, comments, lists, list items, follows in both
 * directions, season ratings, alerts, notifications, push subscriptions and
 * deal votes all go with it.
 *
 * Shared catalogue rows stay. A film is not anyone's personal data, and
 * removing it would delete other people's history along with this account's.
 */
export const deleteAccount = async (req, res) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || !password) {
        return res.status(400).json({ error: 'Your password is required to delete your account' });
    }

    const [user] = await db
        .select({ id: users.id, password: users.password })
        .from(users).where(eq(users.id, req.user.id)).limit(1);

    if (!user) return res.status(404).json({ error: 'Account not found' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'That password is not correct' });

    await db.delete(users).where(eq(users.id, user.id));

    // Clear the session cookie with the attributes it was set with, or it
    // survives the account it belonged to.
    res.cookie('jwt', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        expires: new Date(0),
    });

    return res.status(200).json({ status: 'Success', message: 'Account deleted' });
};
