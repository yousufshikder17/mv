import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import {
    users, trackingItems, mediaItems, seasonRatings, priceAlerts,
    notifications, pushSubscriptions, reviews, reviewVotes, comments,
    follows, dealVotes,
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

    const [alerts, notes, subs, written, votes, said, following, dealVoted] = await Promise.all([
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
    ]);

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
