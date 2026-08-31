CREATE TABLE "season_rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracking_item_id" uuid NOT NULL,
	"season_number" integer NOT NULL,
	"rating" numeric(3, 1),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "season_rating_tracking_item_id_season_number_unique" UNIQUE("tracking_item_id","season_number")
);
--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "season_count" integer;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "episode_count" integer;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "release_status" text;--> statement-breakpoint
ALTER TABLE "tracking_item" ADD COLUMN "progress_season" integer;--> statement-breakpoint
ALTER TABLE "season_rating" ADD CONSTRAINT "season_rating_tracking_item_id_tracking_item_id_fk" FOREIGN KEY ("tracking_item_id") REFERENCES "public"."tracking_item"("id") ON DELETE cascade ON UPDATE no action;