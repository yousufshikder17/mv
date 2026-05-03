import { eq, and } from 'drizzle-orm';
import { db } from '../config/db.js'; // Ensure your db instance is imported
import { movies as moviesTable, watchlistItems } from '../db/schema.js'; // Adjust paths as needed

const addToWatchlist = async (req, res) => {
    // 1. Pull userId from req.body instead of req.user
    const { movieId, userId, status, rating, notes } = req.body;

    // Validation: Make sure we actually got a userId
    if (!userId) {
        return res.status(400).json({ error: "userId is required in the request body" });
    }

    try {
        // 2. Verify Movie Exists
        const [movie] = await db
            .select()
            .from(moviesTable)
            .where(eq(moviesTable.id, movieId))
            .limit(1);

        if (!movie) {
            return res.status(404).json({ error: "Movie not found" });
        }

        // 3. Check if already in Watchlist
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

        // 4. Insert and Return
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

export { addToWatchlist };