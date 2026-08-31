CREATE TABLE "deal_vote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"value" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deal_vote_user_id_media_item_id_unique" UNIQUE("user_id","media_item_id")
);
--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "history_low_cents" integer;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "history_low_1y_cents" integer;--> statement-breakpoint
ALTER TABLE "media_item" ADD COLUMN "history_low_3m_cents" integer;--> statement-breakpoint
ALTER TABLE "deal_vote" ADD CONSTRAINT "deal_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_vote" ADD CONSTRAINT "deal_vote_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;