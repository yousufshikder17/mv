CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"has_spoilers" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follow_follower_id_following_id_unique" UNIQUE("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "review_vote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"helpful" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_vote_user_id_review_id_unique" UNIQUE("user_id","review_id")
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"body" text NOT NULL,
	"has_spoilers" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_user_id_media_item_id_unique" UNIQUE("user_id","media_item_id")
);
--> statement-breakpoint
ALTER TABLE "tracking_item" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profile_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_following_id_user_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_vote" ADD CONSTRAINT "review_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_vote" ADD CONSTRAINT "review_vote_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_media_item_id_media_item_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_item"("id") ON DELETE cascade ON UPDATE no action;