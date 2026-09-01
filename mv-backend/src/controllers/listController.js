import { and, eq, asc } from 'drizzle-orm';
import { db } from '../config/db.js';
import { lists, listItems, mediaItems } from '../db/schema.js';
import {
    visibleList, itemsOf, listsOf, nextPosition, renumber, touch, POSITION_STEP,
} from '../services/listService.js';

const viewer = (req) => (req.user ? req.user.id : null);

/** Loads a list the caller owns, or null. Every write goes through this. */
const ownedList = async (listId, userId) => {
    const [row] = await db.select().from(lists)
        .where(and(eq(lists.id, listId), eq(lists.userId, userId)))
        .limit(1);
    return row ?? null;
};

// 404 rather than 403 throughout. A different answer for "exists but not
// yours" confirms the list exists, which for a private list is the one thing
// its owner did not agree to.
const notFound = (res) => res.status(404).json({ error: 'List not found' });

/** GET /lists - your own lists, private ones included. */
export const myLists = async (req, res) => {
    const rows = await listsOf(req.user.id, req.user.id);
    return res.status(200).json({ status: 'Success', results: rows.length, data: { lists: rows } });
};

/** GET /lists/:listId - public, subject to both privacy gates. */
export const getList = async (req, res) => {
    const list = await visibleList(req.params.listId, viewer(req));
    if (!list) return notFound(res);

    const items = await itemsOf(list.id);
    return res.status(200).json({
        status: 'Success',
        results: items.length,
        data: { list, items },
    });
};

/** POST /lists { name, description, isPublic } */
export const createList = async (req, res) => {
    const { name, description, isPublic } = req.body;

    const existing = await db.select({ id: lists.id }).from(lists)
        .where(and(eq(lists.userId, req.user.id), eq(lists.name, name))).limit(1);
    if (existing.length) {
        // The unique constraint would catch this, but a named 409 is more use
        // than a generic conflict - two lists with one name is almost always
        // a double-submitted form.
        return res.status(409).json({ error: 'You already have a list with that name' });
    }

    const [list] = await db.insert(lists)
        .values({ userId: req.user.id, name, description: description ?? null, isPublic })
        .returning();

    return res.status(201).json({ status: 'Success', data: { list } });
};

/** PATCH /lists/:listId */
export const updateList = async (req, res) => {
    const list = await ownedList(req.params.listId, req.user.id);
    if (!list) return notFound(res);

    const patch = { updatedAt: new Date() };
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.description !== undefined) patch.description = req.body.description;
    if (req.body.isPublic !== undefined) patch.isPublic = req.body.isPublic;

    const [updated] = await db.update(lists).set(patch)
        .where(eq(lists.id, list.id)).returning();

    return res.status(200).json({ status: 'Success', data: { list: updated } });
};

/** DELETE /lists/:listId - the items go with it, by cascade. */
export const deleteList = async (req, res) => {
    const removed = await db.delete(lists)
        .where(and(eq(lists.id, req.params.listId), eq(lists.userId, req.user.id)))
        .returning({ id: lists.id });

    if (!removed.length) return notFound(res);
    return res.status(200).json({ status: 'Success' });
};

/** POST /lists/:listId/items { mediaItemId, note } - appended to the end. */
export const addItem = async (req, res) => {
    const list = await ownedList(req.params.listId, req.user.id);
    if (!list) return notFound(res);

    const [media] = await db.select({ id: mediaItems.id }).from(mediaItems)
        .where(eq(mediaItems.id, req.body.mediaItemId)).limit(1);
    if (!media) return res.status(404).json({ error: 'Item not found' });

    const [existing] = await db.select({ id: listItems.id }).from(listItems)
        .where(and(eq(listItems.listId, list.id), eq(listItems.mediaItemId, media.id)))
        .limit(1);
    if (existing) {
        return res.status(409).json({ error: 'That is already in this list' });
    }

    const [item] = await db.insert(listItems).values({
        listId: list.id,
        mediaItemId: media.id,
        position: await nextPosition(list.id),
        note: req.body.note ?? null,
    }).returning();

    await touch(list.id);
    return res.status(201).json({ status: 'Success', data: { item } });
};

/**
 * PATCH /lists/:listId/items/:itemId { note, moveAfter }
 *
 * moveAfter is the item to sit behind, or null for the front. Positions are
 * sparse, so a move is normally one UPDATE landing between two neighbours.
 */
export const updateItem = async (req, res) => {
    const list = await ownedList(req.params.listId, req.user.id);
    if (!list) return notFound(res);

    const [item] = await db.select().from(listItems)
        .where(and(eq(listItems.id, req.params.itemId), eq(listItems.listId, list.id)))
        .limit(1);
    if (!item) return res.status(404).json({ error: 'Item not found in this list' });

    const patch = {};
    if (req.body.note !== undefined) patch.note = req.body.note;

    if (req.body.moveAfter !== undefined) {
        const ordered = await db.select({ id: listItems.id, position: listItems.position })
            .from(listItems).where(eq(listItems.listId, list.id))
            .orderBy(asc(listItems.position), asc(listItems.addedAt));

        const others = ordered.filter((r) => r.id !== item.id);

        let before = null;
        if (req.body.moveAfter !== null) {
            const index = others.findIndex((r) => r.id === req.body.moveAfter);
            if (index === -1) {
                return res.status(404).json({ error: 'That anchor is not in this list' });
            }
            before = others[index];
            patch.position = before.position + Math.floor(
                (((others[index + 1]?.position) ?? before.position + POSITION_STEP * 2) - before.position) / 2,
            );
        } else {
            // To the front: half of whatever is currently first, or a clean
            // step when the list is empty of others.
            patch.position = others.length ? Math.floor(others[0].position / 2) : POSITION_STEP;
        }
    }

    await db.update(listItems).set(patch).where(eq(listItems.id, item.id));

    // Repeated inserts between the same pair eventually exhaust the gap and
    // two items collide. Renumbering restores the spacing; doing it only on
    // collision keeps it off the common path.
    if (patch.position !== undefined) {
        const positions = await db.select({ position: listItems.position })
            .from(listItems).where(eq(listItems.listId, list.id));
        const seen = new Set(positions.map((p) => p.position));
        if (seen.size !== positions.length) await renumber(list.id);
    }

    await touch(list.id);
    return res.status(200).json({ status: 'Success', data: { items: await itemsOf(list.id) } });
};

/** DELETE /lists/:listId/items/:itemId */
export const removeItem = async (req, res) => {
    const list = await ownedList(req.params.listId, req.user.id);
    if (!list) return notFound(res);

    const removed = await db.delete(listItems)
        .where(and(eq(listItems.id, req.params.itemId), eq(listItems.listId, list.id)))
        .returning({ id: listItems.id });

    if (!removed.length) return res.status(404).json({ error: 'Item not found in this list' });

    await touch(list.id);
    return res.status(200).json({ status: 'Success' });
};

/** GET /social/profile/:userId/lists - someone else's public lists. */
export const listsForProfile = async (req, res) => {
    const rows = await listsOf(req.params.userId, viewer(req));
    return res.status(200).json({ status: 'Success', results: rows.length, data: { lists: rows } });
};
