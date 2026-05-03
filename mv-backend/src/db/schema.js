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
export const movies = pgTable('movie', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    overview: text('overview'),
    releaseYear: integer('release_year').notNull(),
    genres: text('genres').array().notNull().default([]),
    runtime: integer('runtime'),
    posterUrl: text('poster_url'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
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