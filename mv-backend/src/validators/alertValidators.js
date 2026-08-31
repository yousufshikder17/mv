import { z } from "zod";

// Thresholds are integer cents, like every other price in the system - a
// float threshold compared against an integer quote is a rounding bug waiting
// for a sale that lands exactly on the boundary.
export const upsertAlertSchema = z.object({
    mediaItemId: z.string().uuid({ message: "Invalid item id" }),
    thresholdCents: z.coerce
        .number()
        .int("Threshold must be a whole number of cents")
        // 0 is allowed on purpose: "tell me when this is free" is a real
        // thing people want, especially for games.
        .min(0, "Threshold cannot be negative")
        .max(100_000_00, "Threshold is unreasonably high"),
    currency: z.string().length(3).optional(),
});

export const setActiveSchema = z.object({
    active: z.boolean(),
});
