import { and, eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, comments, mediaItems } from '../db/schema.js';

/** GET /social/items/:mediaItemId/comments - public, one level of nesting. */
export const listComments = async (req, res) => {
    const rows = await db
        .select({ comment: comments, authorId: users.id, authorName: users.name })
        .from(comments)
        .innerJoin(users, eq(comments.userId, users.id))
        .where(and(eq(comments.mediaItemId, req.params.mediaItemId), eq(users.profilePublic, true)))
        .orderBy(comments.createdAt)
        .limit(200);

    const all = rows.map((r) => Object.assign({}, r.comment, {
        author: { id: r.authorId, name: r.authorName },
        replies: [],
    }));
    const byId = new Map(all.map((c) => [c.id, c]));

    // Flat list to one level. A reply whose parent is gone is PROMOTED rather
    // than dropped - losing someone's comment because the one above it was
    // deleted is worse than a slightly odd thread.
    const roots = [];
    for (const c of all) {
        const parent = c.parentId ? byId.get(c.parentId) : null;
        if (parent) parent.replies.push(c);
        else roots.push(c);
    }

    return res.status(200).json({ status: 'Success', results: all.length, data: { comments: roots } });
};

/** POST /social/items/:mediaItemId/comments { body, parentId, hasSpoilers } */
export const addComment = async (req, res) => {
    const payload = req.body || {};
    const body = payload.body;
    const hasSpoilers = Boolean(payload.hasSpoilers);

    const [item] = await db.select({ id: mediaItems.id }).from(mediaItems)
        .where(eq(mediaItems.id, req.params.mediaItemId)).limit(1);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // One level only: a reply to a reply attaches to the same root rather
    // than growing a tree that would need its own collapse UI.
    let resolvedParent = null;
    if (payload.parentId) {
        const [parent] = await db.select({ id: comments.id, parentId: comments.parentId })
            .from(comments).where(eq(comments.id, payload.parentId)).limit(1);
        if (parent) resolvedParent = parent.parentId || parent.id;
    }

    const [comment] = await db.insert(comments)
        .values({ userId: req.user.id, mediaItemId: item.id, parentId: resolvedParent, body, hasSpoilers })
        .returning();

    return res.status(201).json({ status: 'Success', data: { comment } });
};

export const deleteComment = async (req, res) => {
    const removed = await db.delete(comments)
        .where(and(eq(comments.id, req.params.commentId), eq(comments.userId, req.user.id)))
        .returning();
    if (!removed.length) return res.status(404).json({ error: 'Comment not found or unauthorized' });
    return res.status(200).json({ status: 'Success' });
};
