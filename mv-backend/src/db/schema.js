import { pgTable, text, timestamp, integer, pgEnum, uuid, unique } from 'drizzle-orm/pg-core';

// 1. Define the Enum for status
export const watchlistStatusEnum = pgEnum('watchlist_status', ['PLANNED', 'WATCHING', 'COMPLETED', 'DROPPED']);

// 2. User Table
export const users = pgTable('user', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').unique().notNull(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// 3. Movie Table
// Shared catalogue. Rows sourced from TMDB are keyed by tmdbId so two users
// adding the same film resolve to one row (which is what makes the
// unique(userId, movieId) constraint on watchlist_item meaningful).
//
// Everything except tmdbId is a CACHE of TMDB content, not our data — TMDB's
// API terms forbid retaining it beyond 6 months. refreshedAt is the stamp that
// makes expiry enforceable; see refreshIfStale in movieController.js.
export const movies = pgTable('movie', {
    id: uuid('id').primaryKey().defaultRandom(),
    tmdbId: integer('tmdb_id').unique(),
    title: text('title').notNull(),
    overview: text('overview'),
    // Nullable: TMDB carries announced-but-unreleased films with an empty
    // release_date, and we'd rather store those than reject them.
    releaseYear: integer('release_year'),
    genres: text('genres').array().notNull().default([]),
    runtime: integer('runtime'),
    posterUrl: text('poster_url'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
    refreshedAt: timestamp('refreshed_at').defaultNow(),
});

// 4. Watchlist Junction Table
export const watchlistItems = pgTable('watchlist_item', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    movieId: uuid('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
    status: watchlistStatusEnum('status').default('PLANNED'),
    rating: integer('rating'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
    // This ensures a user can't add the same movie to their list twice
    unique().on(t.userId, t.movieId),
]);