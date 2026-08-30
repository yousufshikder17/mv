import { z } from "zod";

const addToWatchlistSchema = z.object({
    movieId: z.string().uuid({ message: "Invalid Movie ID format" }),
    status: z.enum(["PLANNED", "WATCHING", "COMPLETED", "DROPPED"], {
        invalid_type_error: "Status must be one of: PLANNED, WATCHING, COMPLETED, DROPPED",
    }).optional(), // Properly chain optional at the end
    rating: z.coerce.number().int("Rating must be an integer").min(1, "Rating must be between 1 and 10").max(10, "Rating must be at most 10").optional(), // Coerce to number and validate range
    notes: z.string().optional(),
});

// PUT /watchlist/:id previously had no schema, so the column types were the
// only check — and they do not encode the 1-10 range the add endpoint applies.
// A rating of 999 stored fine; an out-of-enum status reached Postgres and came
// back as a 500.
//
// movieId is deliberately absent: an update changes how you track a film, not
// which film the row points at.
const updateWatchlistSchema = z.object({
    status: z.enum(["PLANNED", "WATCHING", "COMPLETED", "DROPPED"]).optional(),
    // A union rather than .nullable(): z.coerce.number() turns null into 0,
    // which would fail the min(1) bound and make a rating impossible to clear.
    rating: z
        .union([
            z.null(),
            z.coerce
                .number()
                .int("Rating must be an integer")
                .min(1, "Rating must be between 1 and 10")
                .max(10, "Rating must be at most 10"),
        ])
        .optional(),
    notes: z.string().optional(),
});

export { addToWatchlistSchema, updateWatchlistSchema };