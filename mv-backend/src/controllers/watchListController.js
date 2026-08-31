import { eq, and } from 'drizzle-orm';
import { db } from '../config/db.js';
import { mediaItems, trackingItems } from '../db/schema.js';

// No try/catch in here. Every handler is wrapped in catchAsync at the route,
// which forwards to errorMiddleware — and that is where the Postgres SQLSTATE
// mappings live (23505 unique, 23503 foreign key, 22P02 malformed uuid).
// Catching locally and returning a bare 500 made all three unreachable: a
// request to DELETE /watchlist/not-a-uuid answered 500 when the mapping for it
// was already written and sitting one layer up.
//
// Deliberate 404s and 400s below are business answers, not errors, so they stay.

export const getUserWatchlist = async (req, res) => {
    const userId = req.user.id; // Deriving identity from the verified JWT

    const rows = await db
        .select({
            item: trackingItems,
            movie: mediaItems,
        })
        .from(trackingItems)
        .leftJoin(mediaItems, eq(trackingItems.mediaItemId, mediaItems.id))
        .where(eq(trackingItems.userId, userId));

    const watchlist = rows.map(({ item, movie }) => ({ ...item, movie }));

    return res.status(200).json({
        status: "Success",
        results: watchlist.length,
        data: { watchlist }
    });
};

export const addToWatchlist = async (req, res) => {
    const { movieId, status, rating, notes } = req.body;

    // Pull userId from req.user (populated by authMiddleware) rather than the
    // body. Trusting a body-supplied userId is the classic IDOR: it would let
    // any caller write into another user's list.
    const userId = req.user.id;

    // 1. Verify Movie Exists
    const [movie] = await db
        .select()
        .from(mediaItems)
        .where(eq(mediaItems.id, movieId))
        .limit(1);

    if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
    }

    // 2. Check if already in Watchlist.
    // Advisory only — two concurrent requests can both pass this. The
    // unique(user_id, movie_id) constraint is the actual guarantee, and its
    // 23505 now reaches errorMiddleware, which answers 400 either way.
    const [exists] = await db
        .select()
        .from(trackingItems)
        .where(
            and(
                eq(trackingItems.userId, userId),
                eq(trackingItems.mediaItemId, movieId)
            )
        )
        .limit(1);

    if (exists) {
        return res.status(400).json({ error: "Movie already in your watchlist" });
    }

    // 3. Insert using the secure userId
    const [newItem] = await db
        .insert(trackingItems)
        .values({
            userId,
            // The request field stays `movieId` through M1: this milestone
            // changes the schema, not the API. It becomes `mediaItemId` in M2
            // alongside the "Add film" -> "Add" rename, so the contract moves
            // once rather than twice.
            mediaItemId: movieId,
            status: status || 'PLANNED',
            rating: rating ?? null,
            notes: notes || null
        })
        .returning();

    return res.status(201).json({
        status: "Success",
        data: { watchlistItem: newItem },
    });
};

export const removeFromWatchlist = async (req, res) => {
    const { id } = req.params; // The ID of the watchlist item from the URL
    const userId = req.user.id; // From authMiddleware

    // The userId in the WHERE is what makes this safe: a request for someone
    // else's item matches no row and is indistinguishable from one that does
    // not exist, so the response leaks nothing about other users' lists.
    const result = await db
        .delete(trackingItems)
        .where(
            and(
                eq(trackingItems.id, id),
                eq(trackingItems.userId, userId)
            )
        )
        .returning();

    if (result.length === 0) {
        return res.status(404).json({ error: "Item not found or unauthorized" });
    }

    return res.status(200).json({
        status: "Success",
        message: "Item removed from watchlist",
        deletedItem: result[0]
    });
};

export const updateWatchlistItem = async (req, res) => {
    const { id } = req.params; // The ID of the watchlist entry
    const { status, rating, notes } = req.body;
    const userId = req.user.id; // From authMiddleware

    const result = await db
        .update(trackingItems)
        .set({
            // Only update fields that are provided in the request.
            // Tested against `undefined`, not truthiness: `notes: ""` is a
            // request to clear the note, and a falsy check silently drops
            // it, leaving the old text in place with a 200 response.
            ...(status !== undefined && { status }),
            ...(rating !== undefined && { rating }),
            ...(notes !== undefined && { notes }),
            updatedAt: new Date(), // Good practice for tracking changes
        })
        .where(
            and(
                eq(trackingItems.id, id),
                eq(trackingItems.userId, userId)
            )
        )
        .returning();

    if (result.length === 0) {
        return res.status(404).json({ error: "Item not found or unauthorized" });
    }

    return res.status(200).json({
        status: "Success",
        data: { watchlistItem: result[0] },
    });
};
