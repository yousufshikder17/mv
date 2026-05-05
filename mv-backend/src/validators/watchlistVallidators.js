import { z } from "zod";

const addToWatchlistSchema = z.object({
    movieId: z.string().uuid({ message: "Invalid Movie ID format" }),
    status: z.enum(["PLANNED", "WATCHING", "COMPLETED", "DROPPED"], {
        invalid_type_error: "Status must be one of: PLANNED, WATCHING, COMPLETED, DROPPED",
    }).optional(), // Properly chain optional at the end
    rating: z.coerce.number().int("Rating must be an integer").min(1, "Rating must be between 1 and 10").max(10, "Rating must be at most 10").optional(), // Coerce to number and validate range
    notes: z.string().optional(),
});

export { addToWatchlistSchema };