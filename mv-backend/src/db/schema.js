import { pgTable, text, timestamp, date, integer, numeric, pgEnum, uuid, unique } from 'drizzle-orm/pg-core';

// 1. Enums
//
// Media type drives which status vocabulary and which progress unit apply.
export const mediaTypeEnum = pgEnum('media_type', ['film', 'tv', 'book', 'game', 'album']);

// One general vocabulary, validated per type, rather than per-type enums.
//
// WATCHING / READING / PLAYING carry no information the `type` column does not
// already hold — storing both is the same fact twice, and two places to
// disagree. Six generic values also never grow: adding manga or podcasts later
// needs no migration, whereas a specific enum needs ALTER TYPE ADD VALUE every
// time, and Postgres can never remove an enum value once added.
//
// It also keeps the cross-media query short forever:
//   WHERE status = 'IN_PROGRESS'
// instead of IN ('WATCHING','READING','PLAYING','LISTENING',...).
//
// Display labels are presentation, and live in a lookup keyed by (type,
// status) — see trackingValidators.js. REVISITING covers rewatching /
// rereading / replaying; COLLECTED exists for albums (SPEC §6).
export const trackingStatusEnum = pgEnum('tracking_status', [
    'PLANNED',
    'IN_PROGRESS',
    'COMPLETED',
    'DROPPED',
    'REVISITING',
    'COLLECTED',
]);

// 2. User Table
export const users = pgTable('user', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').unique().notNull(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// 3. Media Item — the shared catalogue (was `movie`)
//
// Keyed by (source, externalId) rather than tmdbId: five-plus metadata sources
// means the identifier is only unique *within* a source. TMDB id 550 and RAWG
// id 550 are different things (SPEC §5).
//
// Everything except the key is a CACHE of the source's content, not our data —
// TMDB's API terms forbid retaining it beyond 6 months. refreshedAt is the
// stamp that makes expiry enforceable; see refreshIfStale in
// mediaItemController.js. That pattern carries to every cached source.
export const mediaItems = pgTable('media_item', {
    id: uuid('id').primaryKey().defaultRandom(),
    type: mediaTypeEnum('type').notNull().default('film'),
    // Free text, not an enum: 'anime', 'manga', 'documentary', 'miniseries'.
    // A vocabulary still being discovered does not belong in a Postgres enum.
    subtype: text('subtype'),
    source: text('source').notNull().default('tmdb'),
    externalId: text('external_id'),
    title: text('title').notNull(),
    // SPEC §4: a non-English user gets a materially worse product without
    // these. Populated by every source that carries them.
    originalTitle: text('original_title'),
    language: text('language'),
    overview: text('overview'),
    // Nullable: TMDB carries announced-but-unreleased films with an empty
    // release_date, and we'd rather store those than reject them.
    releaseYear: integer('release_year'),
    genres: text('genres').array().notNull().default([]),
    // Minutes. Per episode for TV, and null for shows with variable episode
    // lengths — TMDB's episode_run_time is often an empty array.
    runtime: integer('runtime'),
    posterUrl: text('poster_url'),
    // TV only. Null for every other type.
    seasonCount: integer('season_count'),
    episodeCount: integer('episode_count'),
    // The source's own production status: 'Returning Series', 'Ended',
    // 'Released'. Drives a shorter cache TTL for shows still airing — a
    // returning series gains episodes between refreshes; a film does not.
    releaseStatus: text('release_status'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
    refreshedAt: timestamp('refreshed_at').defaultNow(),
}, (t) => [
    unique().on(t.source, t.externalId),
]);

// 4. Tracking Item — the junction (was `watchlist_item`)
export const trackingItems = pgTable('tracking_item', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    mediaItemId: uuid('media_item_id').references(() => mediaItems.id, { onDelete: 'cascade' }),
    status: trackingStatusEnum('status').default('PLANNED'),
    // 1.0-10.0, one decimal. numeric not float: 7.3 is not exactly
    // representable in binary, and averages over thousands of rows drift.
    //
    // NULL means unrated, and 0 is deliberately NOT a valid rating — it would
    // be a second way to say "no opinion" that avg() counts and NULL does not,
    // making "average 6.2" silently become 4.8 and leaving nobody able to tell
    // "I hated it" from "I haven't rated it".
    //
    // mode:'number' matters. Postgres numeric arrives as a STRING by default
    // (drivers do that to preserve precision), so without this the API returns
    // "7.5" and every `rating > 8` in the app compares strings.
    rating: numeric('rating', { precision: 3, scale: 1, mode: 'number' }),
    // User-editable, and meaningless for atomic media (a film is watched or
    // not). Unit is per type: 'episode', 'page', 'percent', 'hour'.
    // TV needs three numbers, not two: "season 2, episode 4 of 10". Season is
    // separate because progressTotal counts episodes within the current
    // season, which is what a viewer actually tracks against.
    progressSeason: integer('progress_season'),
    progressCurrent: integer('progress_current'),
    progressTotal: integer('progress_total'),
    progressUnit: text('progress_unit'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
    // A user can't track the same item twice. This is what the ownership
    // tests rest on.
    unique().on(t.userId, t.mediaItemId),
]);

// 5. Season Rating
//
// Its own table rather than JSON on tracking_item: a per-season score is a
// value you sort, average and compare across users later, and none of that
// works through a JSON blob. One row per (tracking item, season).
//
// Only TV uses this. Nothing enforces that in the schema — a CHECK would need
// a join — so it is enforced where the rating is set.
export const seasonRatings = pgTable('season_rating', {
    id: uuid('id').primaryKey().defaultRandom(),
    trackingItemId: uuid('tracking_item_id')
        .references(() => trackingItems.id, { onDelete: 'cascade' })
        .notNull(),
    seasonNumber: integer('season_number').notNull(),
    // Same scale and the same reasoning as tracking_item.rating.
    rating: numeric('rating', { precision: 3, scale: 1, mode: 'number' }),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
    unique().on(t.trackingItemId, t.seasonNumber),
]);

// 6. Price Quote
// One row per (source, item, day). The normalized shape from SPEC §7 — the
// price layer never learns which adapter produced a row.
//
// Money is integer cents, never float — 0.1 + 0.2 has no business near a price.
export const priceQuotes = pgTable('price_quote', {
    id: uuid('id').primaryKey().defaultRandom(),
    // Nullable, and set only once a catalogue row exists for the same thing:
    // deals arrive for books nobody tracks, and dropping those would defeat
    // the point of accruing history before anyone asks for it.
    mediaItemId: uuid('media_item_id').references(() => mediaItems.id, { onDelete: 'set null' }),
    source: text('source').notNull(),
    // ASIN for Kindle, volume id for Google Books, ITAD game id later.
    externalId: text('external_id').notNull(),
    title: text('title'),
    platform: text('platform').notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull(),
    // Null when the source quotes no list price.
    originalPriceCents: integer('original_price_cents'),
    discountPercent: integer('discount_percent'),
    saleEnds: timestamp('sale_ends'),
    url: text('url').notNull(),
    fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
    // Day the quote is *for*, not when we happened to fetch it. This is the
    // dedupe axis: a retried job on the same day must not double-insert.
    quoteDate: date('quote_date').notNull(),
}, (t) => [
    unique().on(t.source, t.externalId, t.quoteDate),
]);
