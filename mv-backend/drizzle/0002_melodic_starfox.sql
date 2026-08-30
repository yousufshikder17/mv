ALTER TABLE "movie" ALTER COLUMN "release_year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "tmdb_id" integer;--> statement-breakpoint
ALTER TABLE "movie" ADD COLUMN "refreshed_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "movie" ADD CONSTRAINT "movie_tmdb_id_unique" UNIQUE("tmdb_id");