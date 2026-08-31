import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, reviews, reviewVotes, comments, mediaItems } from '../db/schema.js';

const HELPFUL_COUNT = sql`count(*) filter (where ${reviewVotes.helpful} = true)`;
const UNHELPFUL_COUNT = sql`count(*) filter (where ${reviewVotes.helpful} = false)`;

/**
 * GET /social/items/:mediaItemId/reviews - public.
 *
 * Spoiler-flagged reviews are returned WITH their text. The blur is a display
 * decision; withholding the body would break editing your own review and make
 * the flag impossible to undo. The client blurs until clicked (SPEC 9).
 */
export const listReviews = async (req, res) => {
    const rows = await db
        .select({
            review: reviews,
            authorId: users.id,
            authorName: users.name,
            helpful: HELPFUL_COUNT.mapWith(Number),
            unhelpful: UNHELPFUL_COUNT.mapWith(Number),
        })
        .from(reviews)
        .innerJoin(users, eq(reviews.userId, users.id))
        .leftJoin(reviewVotes, eq(reviewVotes.reviewId, reviews.id))
        .where(and(eq(reviews.mediaItemId, req.params.mediaItemId), eq(users.profilePublic, true)))
        .groupBy(reviews.id, users.id)
        .orderBy(desc(HELPFUL_COUNT), desc(reviews.updatedAt))
        .limit(50);

    const list = rows.map((r) => Object.assign({}, r.review, {
        author: { id: r.authorId, name: r.authorName },
        helpful: r.helpful,
        unhelpful: r.unhelpful,
    }));

    return res.status(200).json({ status: 'Success', results: list.length, data: { reviews: list } });
};

/** PUT /social/items/:mediaItemId/review - upsert; one per person per item. */
export const upsertReview = async (req, res) => {
    const body = req.body ? req.body.body : null;
    const hasSpoilers = Boolean(req.body && req.body.hasSpoilers);

    const [item] = await db.select({ id: mediaItems.id }).from(mediaItems)
        .where(eq(mediaItems.id, req.params.mediaItemId)).limit(1);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const [review] = await db
        .insert(reviews)
        .values({ userId: req.user.id, mediaItemId: item.id, body, hasSpoilers })
        .onConflictDoUpdate({
            target: [reviews.userId, reviews.mediaItemId],
            // A rewrite is an edit, not a second opinion.
            set: { body, hasSpoilers, updatedAt: new Date() },
        })
        .returning();

    return res.status(200).json({ status: 'Success', data: { review } });
};

export const deleteReview = async (req, res) => {
    const removed = await db.delete(reviews)
        .where(and(eq(reviews.id, req.params.reviewId), eq(reviews.userId, req.user.id)))
        .returning();
    // 404 rather than 403 - a different answer confirms it exists.
    if (!removed.length) return res.status(404).json({ error: 'Review not found or unauthorized' });
    return res.status(200).json({ status: 'Success' });
};

/** POST /social/reviews/:reviewId/vote { helpful } */
export const voteReview = async (req, res) => {
    const helpful = Boolean(req.body && req.body.helpful);

    const [review] = await db.select({ id: reviews.id, userId: reviews.userId })
        .from(reviews).where(eq(reviews.id, req.params.reviewId)).limit(1);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.userId === req.user.id) {
        // Voting on your own review is not signal, it is self-promotion.
        return res.status(400).json({ error: 'You cannot vote on your own review' });
    }

    await db.insert(reviewVotes)
        .values({ userId: req.user.id, reviewId: review.id, helpful })
        .onConflictDoUpdate({ target: [reviewVotes.userId, reviewVotes.reviewId], set: { helpful } });

    return res.status(200).json({ status: 'Success' });
};
