export const createMovieSchema = z.object({
    title: z.string().trim().min(1, "Movie title is required"),
    releaseYear: z.coerce
        .number()
        .int()
        .min(1888)
        .max(new Date().getFullYear() + 10),
    overview: z.string().trim().optional(),
    genres: z.array(z.string()).optional(),
    runtime: z.coerce.number().int().positive().optional(),
    posterUrl: z.string().url().optional(),
});

// Automatically makes every field in createMovieSchema optional
export const updateMovieSchema = createMovieSchema.partial();