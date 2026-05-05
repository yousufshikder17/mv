import { eq, and } from 'drizzle-orm';
import { db } from '../config/db.js';
import { movies as moviesTable, watchlistItems } from '../db/schema.js';

// Use "export const" for a Named Export to resolve the SyntaxError

export const getUserWatchlist = async (req, res) => {
    const userId = req.user.id; // Deriving identity from the verified JWT

    try {
        const watchlist = await db
            .select()
            .from(watchlistItems)
            .where(eq(watchlistItems.userId, userId));

        return res.status(200).json({
            status: "Success",
            results: watchlist.length,
            data: { watchlist }
        });
    } catch (error) {
        console.error("Fetch Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};


export const addToWatchlist = async (req, res) => {
    const { movieId, status, rating, notes } = req.body;

    // SECURITY FIX: Pull userId from req.user (populated by authMiddleware)
    // This prevents IDOR attacks where users could add to others' lists.
    const userId = req.user.id;

    try {
        // 1. Verify Movie Exists
        const [movie] = await db
            .select()
            .from(moviesTable)
            .where(eq(moviesTable.id, movieId))
            .limit(1);

        if (!movie) {
            return res.status(404).json({ error: "Movie not found" });
        }

        // 2. Check if already in Watchlist
        const [exists] = await db
            .select()
            .from(watchlistItems)
            .where(
                and(
                    eq(watchlistItems.userId, userId),
                    eq(watchlistItems.movieId, movieId)
                )
            )
            .limit(1);

        if (exists) {
            return res.status(400).json({ error: "Movie already in your watchlist" });
        }

        // 3. Insert using the secure userId
        const [newItem] = await db
            .insert(watchlistItems)
            .values({
                userId,
                movieId,
                status: status || 'PLANNED',
                rating: rating || null,
                notes: notes || null
            })
            .returning();

        return res.status(201).json({
            status: "Success",
            data: { watchlistItem: newItem },
        });

    } catch (error) {
        console.error("Database Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }

};


export const removeFromWatchlist = async (req, res) => {
    const { id } = req.params; // The ID of the watchlist item from the URL
    const userId = req.user.id; // From your authMiddleware

    try {
        // We use 'and' to ensure the item belongs to the logged-in user
        const result = await db
            .delete(watchlistItems)
            .where(
                and(
                    eq(watchlistItems.id, id),
                    eq(watchlistItems.userId, userId)
                )
            )
            .returning();

        // If the array is empty, it means either the ID didn't exist 
        // or the user didn't own that record.
        if (result.length === 0) {
            return res.status(404).json({ error: "Item not found or unauthorized" });
        }

        return res.status(200).json({
            status: "Success",
            message: "Item removed from watchlist",
            deletedItem: result[0]
        });

    } catch (error) {
        console.error("Delete Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const updateWatchlistItem = async (req, res) => {
    const { id } = req.params; // The ID of the watchlist entry
    const { status, rating, notes } = req.body;
    const userId = req.user.id; // From authMiddleware

    try {
        const result = await db
            .update(watchlistItems)
            .set({
                // Only update fields that are provided in the request
                ...(status && { status }),
                ...(rating !== undefined && { rating }),
                ...(notes && { notes }),
                updatedAt: new Date(), // Good practice for tracking changes
            })
            .where(
                and(
                    eq(watchlistItems.id, id),
                    eq(watchlistItems.userId, userId)
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

    } catch (error) {
        console.error("Update Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};