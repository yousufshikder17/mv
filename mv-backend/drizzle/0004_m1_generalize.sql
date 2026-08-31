-- M1: generalize the films-only schema to any media type.
--
-- Hand-written rather than generated: drizzle-kit resolves renames through an
-- interactive prompt, and its non-interactive fallback is DROP + CREATE, which
-- would delete every row. These are RENAMEs and in-place ALTERs, so existing
-- film rows, watchlist entries and ratings carry over.
--
-- Rating conversion is x2 (1-5 -> 2.0-10.0). Only even values result, and that
-- is correct: nobody ever entered half-star precision, so interpolating would
-- fabricate data that was never collected.

CREATE TYPE "public"."media_type" AS ENUM('film', 'tv', 'book', 'game', 'album');--> statement-breakpoint
CREATE TYPE "public"."tracking_status" AS ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REVISITING', 'COLLECTED');--> statement-breakpoint

--
-- movie -> media_item
--
ALTER TABLE "movie" RENAME TO "media_item";--> statement-breakpoint
ALTER TABLE "media_item" RENAME CONSTRAINT "movie_created_by_user_id_fk" TO "media_item_created_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "media_item" DROP CONSTRAINT "movie_tmdb_id_unique";--> statement-breakpoint

ALTER TABLE "media_item" ADD COLUMN "type" "media_type" DEFAULT 'film' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "subtype" text;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "source" text DEFAULT 'tmdb' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "original_title" text;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "language" text;--> statement-breakpoint

-- Every existing row came from TMDB, so the generic key is (tmdb, <tmdb id>).
UPDATE "media_item" SET "external_id" = "tmdb_id"::text WHERE "tmdb_id" IS NOT NULL;--> statement-breakpoint

-- tmdb_id goes: keeping it alongside external_id stores the same fact twice,
-- and the whole point of (source, external_id) is that TMDB id 550 and RAWG
-- id 550 are different things.
ALTER TABLE "media_item" DROP COLUMN "tmdb_id";--> statement-breakpoint
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_source_external_id_unique" UNIQUE("source","external_id");--> statement-breakpoint

--
-- watchlist_item -> tracking_item
--
ALTER TABLE "watchlist_item" RENAME TO "tracking_item";--> statement-breakpoint
ALTER TABLE "tracking_item" RENAME COLUMN "movie_id" TO "media_item_id";--> statement-breakpoint
ALTER TABLE "tracking_item" RENAME CONSTRAINT "watchlist_item_user_id_user_id_fk" TO "tracking_item_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "tracking_item" RENAME CONSTRAINT "watchlist_item_movie_id_movie_id_fk" TO "tracking_item_media_item_id_media_item_id_fk";--> statement-breakpoint
ALTER TABLE "tracking_item" DROP CONSTRAINT "watchlist_item_user_id_movie_id_unique";--> statement-breakpoint
ALTER TABLE "tracking_item" ADD CONSTRAINT "tracking_item_user_id_media_item_id_unique" UNIQUE("user_id","media_item_id");--> statement-breakpoint

-- Status: WATCHING -> IN_PROGRESS, everything else keeps its name. The default
-- is dropped first because Postgres cannot cast it while the column type
-- changes underneath it.
ALTER TABLE "tracking_item" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tracking_item" ALTER COLUMN "status" TYPE "tracking_status"
  USING (CASE "status"::text
    WHEN 'WATCHING' THEN 'IN_PROGRESS'
    ELSE "status"::text
  END)::"tracking_status";--> statement-breakpoint
ALTER TABLE "tracking_item" ALTER COLUMN "status" SET DEFAULT 'PLANNED';--> statement-breakpoint
DROP TYPE "public"."watchlist_status";--> statement-breakpoint

-- Rating: 1-5 integer -> 1.0-10.0 numeric, doubled.
ALTER TABLE "tracking_item" ALTER COLUMN "rating" TYPE numeric(3, 1)
  USING ("rating" * 2)::numeric(3, 1);--> statement-breakpoint

ALTER TABLE "tracking_item" ADD COLUMN "progress_current" integer;--> statement-breakpoint
ALTER TABLE "tracking_item" ADD COLUMN "progress_total" integer;--> statement-breakpoint
ALTER TABLE "tracking_item" ADD COLUMN "progress_unit" text;--> statement-breakpoint

--
-- price_quote gains its catalogue link. Nullable and ON DELETE SET NULL:
-- quotes arrive for items nobody tracks, and the price history must outlive
-- the catalogue row it happens to point at.
--
ALTER TABLE "price_quote" ADD COLUMN "media_item_id" uuid;--> statement-breakpoint
ALTER TABLE "price_quote" ADD CONSTRAINT "price_quote_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE set null ON UPDATE no action;
