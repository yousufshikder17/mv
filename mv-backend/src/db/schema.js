import { pgTable, text, timestamp, date, integer, numeric, boolean, pgEnum, uuid, unique } from 'drizzle-orm/pg-core';

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
    // The item's id in its PRICE source, which is a different service from its
    // metadata source: a game's metadata is RAWG's, its prices are ITAD's.
    // Resolved once by title lookup and kept, so the poller does not spend a
    // request rediscovering it every run.
    //
    // ponytail: one nullable column per price source. Books will want a second
    // when M6 lands; a media_external_id(item, source, id) table earns its
    // place at three, not at two.
    itadId: text('itad_id'),
    // Games only: every platform the title is released on. The platform a
    // given user actually plays it on lives on tracking_item, because those
    // are different facts - the catalogue row is shared between users.
    platforms: text('platforms').array().notNull().default([]),
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
    // type is part of the key, not decoration. A source's id space is only
    // unique WITHIN a media type: TMDB movie 550 is Fight Club and TMDB tv 550
    // is "Till Death Us Do Part". Keyed on (source, externalId) alone, the
    // second import silently overwrote the first.
    unique().on(t.source, t.type, t.externalId),
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
    // Which platform this user plays it on (SPEC §6, games "Extra"). Free
    // text rather than an enum: platform names come from RAWG and new consoles
    // arrive without asking us.
    platform: text('platform'),
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

// 6. Price Alert
//
// "Tell me when this drops below X." One row per (user, item) - a second
// threshold on the same item is an edit, not another alert, which is what the
// unique constraint enforces.
//
// SPEC §9: price alerts are ALWAYS private. There is no sharing story here and
// no public read path, unlike lists.
export const priceAlerts = pgTable('price_alert', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .references(() => users.id, { onDelete: 'cascade' })
        .notNull(),
    mediaItemId: uuid('media_item_id')
        .references(() => mediaItems.id, { onDelete: 'cascade' })
        .notNull(),
    // Integer cents, same as price_quote. Fire when a quote lands at or below.
    thresholdCents: integer('threshold_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    // Paused rather than deleted, so a threshold survives being switched off.
    active: boolean('active').notNull().default(true),
    // What stops a 4-week sale sending 28 identical emails. Null until it
    // first fires.
    lastNotifiedAt: timestamp('last_notified_at'),
    // The price that triggered the last notification. A further drop should
    // notify again; the same price should not.
    lastNotifiedCents: integer('last_notified_cents'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
    unique().on(t.userId, t.mediaItemId),
]);

// 7. Notification
//
// The in-app inbox, and the record that a thing was announced at all. Written
// for EVERY alert regardless of channel, so email and push are decorations on
// a row that already exists - if the mail server is down or nobody has granted
// push permission, the news is still waiting in the app.
export const notifications = pgTable('notification', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .references(() => users.id, { onDelete: 'cascade' })
        .notNull(),
    // 'price_drop' today. A string rather than an enum because the reasons to
    // notify someone will grow faster than a Postgres enum wants to.
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    // Where clicking it should go.
    url: text('url'),
    mediaItemId: uuid('media_item_id').references(() => mediaItems.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. Push Subscription
//
// One row per browser that granted permission - a person with a laptop and a
// phone has two, and both should buzz.
//
// Web Push needs no third-party service: VAPID keys are generated locally, so
// this channel depends on nothing we have to sign up for, unlike email.
export const pushSubscriptions = pgTable('push_subscription', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .references(() => users.id, { onDelete: 'cascade' })
        .notNull(),
    // The push service URL. Unique because re-subscribing the same browser
    // must update the row rather than accumulate duplicates that all buzz.
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. Price Quote
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
