import { z } from "zod";

// One general status vocabulary, validated per media type (SPEC §6).
//
// The type column already says a row is a book, so storing READING as well as
// type='book' is the same fact twice. Generic values keep the enum at six
// forever: a new media type needs no migration, and Postgres can never remove
// an enum value once added.
export const TRACKING_STATUSES = [
    'PLANNED',
    'IN_PROGRESS',
    'COMPLETED',
    'DROPPED',
    'REVISITING',
    'COLLECTED',
];

/** Which statuses each media type may use. */
export const STATUSES_BY_TYPE = {
    film: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING'],
    tv: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING'],
    book: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING'],
    game: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING'],
    // An album is not "completed" — you listen to it or you own it (SPEC §6).
    album: ['PLANNED', 'IN_PROGRESS', 'COLLECTED'],
};

/**
 * Display label per (type, status). Presentation, deliberately not storage —
 * this is the whole reason the stored vocabulary can stay generic.
 */
export const STATUS_LABELS = {
    film: { IN_PROGRESS: 'Watching', REVISITING: 'Rewatching' },
    tv: { IN_PROGRESS: 'Watching', REVISITING: 'Rewatching' },
    book: { IN_PROGRESS: 'Reading', REVISITING: 'Rereading' },
    game: { IN_PROGRESS: 'Playing', REVISITING: 'Replaying' },
    album: { IN_PROGRESS: 'Listening', COLLECTED: 'In collection' },
};

const DEFAULT_LABELS = {
    PLANNED: 'Planned',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    DROPPED: 'Dropped',
    REVISITING: 'Revisiting',
    COLLECTED: 'Collected',
};

export const statusLabel = (type, status) =>
    STATUS_LABELS[type]?.[status] ?? DEFAULT_LABELS[status] ?? status;

/** Default progress unit per type. Null where progress is meaningless. */
export const PROGRESS_UNITS = {
    film: null,   // atomic — a film is watched or it is not
    tv: 'episode',
    book: 'page',
    game: 'hour',
    album: null,
};

// Rating is 1.0-10.0 in half steps.
//
// 0 is deliberately NOT valid. The column is nullable and NULL already means
// unrated; adding 0 gives two states that look identical in a star widget but
// differ in every aggregate — avg() counts 0 and skips NULL, so "average 6.2"
// silently becomes 4.8 and nobody can tell "I hated it" from "not rated yet".
//
// Half steps are enforced here rather than in the column so that changing the
// granularity later is a validator change, not a migration.
const ratingValue = z.coerce
    .number()
    .min(1, "Rating must be between 1 and 10")
    .max(10, "Rating must be at most 10")
    .refine((n) => Number.isInteger(n * 2), {
        message: "Rating must be in steps of 0.5",
    });

const addToWatchlistSchema = z.object({
    movieId: z.string().uuid({ message: "Invalid Movie ID format" }),
    status: z.enum(TRACKING_STATUSES, {
        invalid_type_error: `Status must be one of: ${TRACKING_STATUSES.join(', ')}`,
    }).optional(),
    rating: ratingValue.optional(),
    notes: z.string().optional(),
    progressSeason: z.coerce.number().int().min(0).optional(),
    progressCurrent: z.coerce.number().int().min(0).optional(),
    progressTotal: z.coerce.number().int().min(0).optional(),
});

// PUT /watchlist/:id previously had no schema, so the column types were the
// only check — and they do not encode the 1-10 range the add endpoint applies.
// A rating of 999 stored fine; an out-of-enum status reached Postgres and came
// back as a 500.
//
// movieId is deliberately absent: an update changes how you track something,
// not which item the row points at.
const updateWatchlistSchema = z.object({
    status: z.enum(TRACKING_STATUSES).optional(),
    // A union rather than .nullable(): z.coerce.number() turns null into 0,
    // which would fail the min(1) bound and make a rating impossible to clear.
    rating: z.union([z.null(), ratingValue]).optional(),
    notes: z.string().optional(),
    progressSeason: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
    progressCurrent: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
    progressTotal: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
});

// Same scale and the same NULL-means-unrated reasoning as the item rating.
const seasonRatingSchema = z.object({
    rating: z.union([z.null(), ratingValue]).optional(),
    notes: z.union([z.null(), z.string()]).optional(),
});

export { addToWatchlistSchema, updateWatchlistSchema, seasonRatingSchema };
