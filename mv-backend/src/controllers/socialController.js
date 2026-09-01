import { and, eq, desc } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, follows, mediaItems, trackingItems } from '../db/schema.js';
import { publicProfile, activityFeed } from '../services/socialService.js';

// Optional auth: these answer to anyone, but a signed-in viewer sees their own
// private profile and their follow state.
const viewer = (req) => (req.user ? req.user.id : null);

/** GET /social/profile/:userId - public, subject to the profile flag. */
export const getProfile = async (req, res) => {
    const profile = await publicProfile(req.params.userId, viewer(req));
    // 404 for both "absent" and "private". A distinct answer would confirm
    // the account exists, which its owner did not choose to publish.
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    return res.status(200).json({ status: 'Success', data: { profile } });
};

/** GET /social/profile/:userId/items - what they track, minus hidden rows. */
export const getProfileItems = async (req, res) => {
    const profile = await publicProfile(req.params.userId, viewer(req));
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Columns named explicitly, never the whole row.
    //
    // `select({ item: trackingItems })` expands to every column, which shipped
    // tracking_item.notes - private scratch text, by the schema's own
    // definition, and something the privacy page promises is "never public".
    // Nothing rendered it, so the leak was invisible in the UI.
    //
    // The hidden-row filter below does not help: it decides which ROWS a
    // stranger sees, not which COLUMNS. A visible row's notes are exactly the
    // case that leaked.
    const publicColumns = {
        id: trackingItems.id,
        mediaItemId: trackingItems.mediaItemId,
        status: trackingItems.status,
        rating: trackingItems.rating,
        platform: trackingItems.platform,
        progressSeason: trackingItems.progressSeason,
        progressCurrent: trackingItems.progressCurrent,
        progressTotal: trackingItems.progressTotal,
        progressUnit: trackingItems.progressUnit,
        createdAt: trackingItems.createdAt,
        updatedAt: trackingItems.updatedAt,
    };

    // Your own profile is the one place the private fields belong.
    const columns = profile.isSelf
        ? { ...publicColumns, notes: trackingItems.notes, hidden: trackingItems.hidden }
        : publicColumns;

    const rows = await db
        .select({ item: columns, media: mediaItems })
        .from(trackingItems)
        .innerJoin(mediaItems, eq(trackingItems.mediaItemId, mediaItems.id))
        .where(and(
            eq(trackingItems.userId, req.params.userId),
            // Your own profile shows everything; anyone else sees only what
            // is not hidden.
            profile.isSelf ? undefined : eq(trackingItems.hidden, false),
        ))
        .orderBy(desc(trackingItems.updatedAt))
        .limit(100);

    const items = rows.map((r) => Object.assign({}, r.item, { movie: r.media }));
    return res.status(200).json({ status: 'Success', results: items.length, data: { items } });
};

/** POST /social/follow/:userId - asymmetric, no approval needed. */
export const follow = async (req, res) => {
    if (req.params.userId === req.user.id) {
        return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    const [target] = await db.select({ id: users.id }).from(users)
        .where(eq(users.id, req.params.userId)).limit(1);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Following twice is the same as following once.
    await db.insert(follows)
        .values({ followerId: req.user.id, followingId: target.id })
        .onConflictDoNothing();

    return res.status(200).json({ status: 'Success' });
};

export const unfollow = async (req, res) => {
    await db.delete(follows).where(and(
        eq(follows.followerId, req.user.id),
        eq(follows.followingId, req.params.userId),
    ));
    return res.status(200).json({ status: 'Success' });
};

/** GET /social/feed - activity from the people you follow. */
export const getFeed = async (req, res) => {
    const activity = await activityFeed(req.user.id);
    return res.status(200).json({
        status: 'Success',
        results: activity.length,
        // Stated plainly rather than shown as a bare empty list. SPEC 9
        // forbids seeding fake activity, so an honest empty state has to
        // explain itself instead.
        reason: activity.length ? null : 'follow_nobody_yet',
        data: { activity },
    });
};
