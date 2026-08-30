import { z } from "zod";

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

// Import takes only the TMDB id — every other field comes from TMDB itself,
// so there is nothing else for the client to get wrong.
export const importMovieSchema = z.object({
    tmdbId: z.coerce.number().int().positive("A valid TMDB id is required"),
});
