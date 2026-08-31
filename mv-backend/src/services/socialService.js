import { and, eq, desc, inArray, sql, isNull } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, follows, trackingItems, mediaItems, reviews } from '../db/schema.js';

/**
 * Profiles, following and the activity feed.
 *
 * Privacy is layered, and checked outermost-first (SPEC 9):
 *
 *   1. profile-level - a private profile is invisible to everyone
 *   2. per-item      - a hidden tracking row never appears anywhere public
 *   3. per-list      - not yet; lists as a first-class object do not exist
 *
 * Price alerts appear at none of these levels. SPEC 9 says they are ALWAYS
 * private, so there is deliberately no code path here that could expose one.
 */

/** Statistics for a profile. Derived, never stored - nothing can drift. */
export const profileStats = async (userId, { includeHidden = false } = {}) => {
    const rows = await db
        .select({ status: trackingItems.status, type: mediaItems.type, rating: trackingItems.rating })
        .from(trackingItems)
        .innerJoin(mediaItems, eq(trackingItems.mediaItemId, mediaItems.id))
        .where(and(
            eq(trackingItems.userId, userId),
            includeHidden ? undefined : eq(trackingItems.hidden, false),
        ));

    const byStatus = {};
    const byType = {};
    let rated = 0;
    let ratingTotal = 0;

    for (const row of rows) {
        byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
        byType[row.type] = (byType[row.type] ?? 0) + 1;
        if (row.rating != null) { rated += 1; ratingTotal += row.rating; }
    }

    const completed = (byStatus.COMPLETED ?? 0) + (byStatus.COLLECTED ?? 0);

    return {
        tracked: rows.length,
        completed,
        // Guarded: 0/0 is NaN, which renders as "NaN%" on an empty profile.
        completionRate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
        dropped: byStatus.DROPPED ?? 0,
        revisiting: byStatus.REVISITING ?? 0,
        inProgress: byStatus.IN_PROGRESS ?? 0,
        averageRating: rated ? Number((ratingTotal / rated).toFixed(1)) : null,
        byType,
    };
};

/**
 * A public profile, or null when it is private or absent.
 *
 * Returns null for both cases on purpose: a distinct "this profile is private"
 * answer confirms the account exists, which is information the owner did not
 * choose to publish.
 */
export const publicProfile = async (userId, viewerId = null) => {
    const [user] = await db
        .select({ id: users.id, name: users.name, bio: users.bio, profilePublic: users.profilePublic, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user) return null;
    // Your own profile is always visible to you, private or not.
    if (!user.profilePublic && viewerId !== userId) return null;

    const [{ followers }] = await db
        .select({ followers: sql`count(*)`.mapWith(Number) })
        .from(follows).where(eq(follows.followingId, userId));
    const [{ following }] = await db
        .select({ following: sql`count(*)`.mapWith(Number) })
        .from(follows).where(eq(follows.followerId, userId));

    const isFollowing = viewerId
        ? (await db.select({ id: follows.id }).from(follows)
            .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, userId))).limit(1)).length > 0
        : false;

    return {
        ...user,
        // Never leak the email - it is not part of a public profile.
        stats: await profileStats(userId, { includeHidden: viewerId === userId }),
        followers,
        following,
        isFollowing,
        isSelf: viewerId === userId,
    };
};

/**
 * What the people you follow have been doing.
 *
 * Hidden items and private profiles are excluded at the query, not filtered
 * afterwards - a feed that fetches private rows and hopes to drop them later
 * is one bug away from publishing them.
 */
export const activityFeed = async (userId, { limit = 50 } = {}) => {
    const followed = await db
        .select({ id: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, userId));

    const ids = followed.map((f) => f.id);
    // Nobody followed yet. An empty feed is the honest answer - SPEC 9 is
    // explicit that fake activity must never be seeded.
    if (!ids.length) return [];

    const tracked = await db
        .select({
            kind: sql`'tracked'`,
            at: trackingItems.updatedAt,
            userId: users.id,
            userName: users.name,
            status: trackingItems.status,
            rating: trackingItems.rating,
            itemId: mediaItems.id,
            // The public item route is keyed by the source's own id, not ours.
            externalId: mediaItems.externalId,
            title: mediaItems.title,
            type: mediaItems.type,
            posterUrl: mediaItems.posterUrl,
            body: sql`null`,
            hasSpoilers: sql`false`,
        })
        .from(trackingItems)
        .innerJoin(users, eq(trackingItems.userId, users.id))
        .innerJoin(mediaItems, eq(trackingItems.mediaItemId, mediaItems.id))
        .where(and(
            inArray(trackingItems.userId, ids),
            eq(trackingItems.hidden, false),
            eq(users.profilePublic, true),
        ))
        .orderBy(desc(trackingItems.updatedAt))
        .limit(limit);

    const written = await db
        .select({
            kind: sql`'reviewed'`,
            at: reviews.updatedAt,
            userId: users.id,
            userName: users.name,
            status: sql`null`,
            rating: sql`null`,
            itemId: mediaItems.id,
            // The public item route is keyed by the source's own id, not ours.
            externalId: mediaItems.externalId,
            title: mediaItems.title,
            type: mediaItems.type,
            posterUrl: mediaItems.posterUrl,
            body: reviews.body,
            hasSpoilers: reviews.hasSpoilers,
        })
        .from(reviews)
        .innerJoin(users, eq(reviews.userId, users.id))
        .innerJoin(mediaItems, eq(reviews.mediaItemId, mediaItems.id))
        .where(and(inArray(reviews.userId, ids), eq(users.profilePublic, true)))
        .orderBy(desc(reviews.updatedAt))
        .limit(limit);

    return [...tracked, ...written]
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, limit);
};
