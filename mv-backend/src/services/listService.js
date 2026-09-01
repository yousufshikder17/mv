import { and, eq, asc, desc, sql, max } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, lists, listItems, mediaItems } from '../db/schema.js';

/**
 * Lists — curation, kept separate from the tracking ledger.
 *
 * Privacy here is SPEC 9's third layer, and it is the one M8 could not build:
 * profile-level and per-item shipped then, per-LIST had nothing to hang a flag
 * on until a list existed as an object.
 *
 * Two gates, checked in this order:
 *   1. the list's own isPublic flag
 *   2. the owner's profilePublic flag
 *
 * Both must hold for a stranger to see a list. A public list on a profile
 * someone has since made private is not public any more — the outer setting
 * wins, because that is the one the person reached for when they wanted to
 * disappear.
 */

// Sparse positions, so moving an item between two neighbours is one UPDATE
// rather than renumbering every row after it.
export const POSITION_STEP = 10;

/** The list plus its owner, or null when the viewer may not see it. */
export const visibleList = async (listId, viewerId = null) => {
    const [row] = await db
        .select({
            list: lists,
            ownerName: users.name,
            ownerPublic: users.profilePublic,
        })
        .from(lists)
        .innerJoin(users, eq(lists.userId, users.id))
        .where(eq(lists.id, listId))
        .limit(1);

    if (!row) return null;

    const isOwner = viewerId === row.list.userId;
    // Your own lists are always visible to you, private or not.
    if (!isOwner && (!row.list.isPublic || !row.ownerPublic)) return null;

    return {
        ...row.list,
        owner: { id: row.list.userId, name: row.ownerName },
        isOwner,
    };
};

/** The items in a list, in order. Assumes visibility has already been checked. */
export const itemsOf = async (listId) => {
    const rows = await db
        .select({ item: listItems, media: mediaItems })
        .from(listItems)
        .innerJoin(mediaItems, eq(listItems.mediaItemId, mediaItems.id))
        .where(eq(listItems.listId, listId))
        .orderBy(asc(listItems.position), asc(listItems.addedAt));

    return rows.map((r) => ({
        id: r.item.id,
        position: r.item.position,
        note: r.item.note,
        addedAt: r.item.addedAt,
        movie: r.media,
    }));
};

/** Counts per list, so an index does not need one query per row. */
const countsFor = async (listIds) => {
    if (!listIds.length) return new Map();

    const rows = await db
        .select({ listId: listItems.listId, n: sql`count(*)`.mapWith(Number) })
        .from(listItems)
        .where(sql`${listItems.listId} in ${listIds}`)
        .groupBy(listItems.listId);

    return new Map(rows.map((r) => [r.listId, r.n]));
};

/**
 * Someone's lists.
 *
 * The viewer decides what comes back: your own request returns everything,
 * anyone else's returns only public lists on a public profile.
 */
export const listsOf = async (userId, viewerId = null) => {
    const isOwner = viewerId === userId;

    if (!isOwner) {
        const [owner] = await db
            .select({ profilePublic: users.profilePublic })
            .from(users).where(eq(users.id, userId)).limit(1);
        if (!owner || !owner.profilePublic) return [];
    }

    const rows = await db
        .select()
        .from(lists)
        .where(and(
            eq(lists.userId, userId),
            isOwner ? undefined : eq(lists.isPublic, true),
        ))
        .orderBy(desc(lists.updatedAt));

    const counts = await countsFor(rows.map((r) => r.id));

    return rows.map((r) => ({ ...r, itemCount: counts.get(r.id) ?? 0 }));
};

/** The next position at the end of a list. */
export const nextPosition = async (listId) => {
    const [row] = await db
        .select({ highest: max(listItems.position) })
        .from(listItems)
        .where(eq(listItems.listId, listId));

    return (row?.highest ?? 0) + POSITION_STEP;
};

/**
 * Renumbers a list to an even 10, 20, 30...
 *
 * Called after a move, and only when two items have collided on the same
 * position — repeated inserts between the same pair eventually exhaust the gap,
 * and at that point sparse numbering has to be re-established or the order
 * silently stops being stable.
 */
export const renumber = async (listId) => {
    const rows = await db
        .select({ id: listItems.id })
        .from(listItems)
        .where(eq(listItems.listId, listId))
        .orderBy(asc(listItems.position), asc(listItems.addedAt));

    let position = 0;
    for (const row of rows) {
        position += POSITION_STEP;
        await db.update(listItems).set({ position }).where(eq(listItems.id, row.id));
    }
    return rows.length;
};

/** Bumps updatedAt, so a list's index ordering reflects real edits. */
export const touch = (listId) =>
    db.update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, listId));
