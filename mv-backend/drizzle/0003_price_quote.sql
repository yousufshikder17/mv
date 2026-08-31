CREATE TABLE "price_quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text,
	"platform" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"original_price_cents" integer,
	"discount_percent" integer,
	"sale_ends" timestamp,
	"url" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"quote_date" date NOT NULL,
	CONSTRAINT "price_quote_source_external_id_quote_date_unique" UNIQUE("source","external_id","quote_date")
);
