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
    // Named tmdbId for the original films-only contract; it now carries the
    // source's own id, whichever source that is. Renamed with the rest of the
    // contract when a caller other than our own frontend exists.
    // Was a number, because films-only meant TMDB-only. Open Library work ids
    // are strings like OL20893680W, so this is now the source's id whatever
    // shape that source uses. Numeric ids still coerce fine.
    tmdbId: z.union([
        z.coerce.number().int().positive(),
        z.string().min(1).max(64),
    ], { message: "A valid source id is required" }),
    // Defaulted, so the pre-M2 contract (films only) keeps working unchanged.
    //
    // This list has to grow with the adapter registry. It did not when games
    // landed, so every game import was rejected by validation before the
    // controller ever saw it - a 400 that looked like a bad request rather
    // than a missing case.
    type: z.enum(["film", "tv", "game", "book", "album"]).default("film"),
});
