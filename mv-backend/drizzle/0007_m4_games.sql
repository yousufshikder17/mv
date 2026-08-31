ALTER TABLE "media_item" ADD COLUMN "platforms" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_item" ADD COLUMN "platform" text;