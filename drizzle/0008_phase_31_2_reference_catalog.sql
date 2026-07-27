CREATE TABLE "reference_catalog_songs" (
	"id" text PRIMARY KEY NOT NULL,
	"language" "song_language" NOT NULL,
	"canonical_number" integer NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	CONSTRAINT "reference_catalog_songs_canonical_number_positive" CHECK ("reference_catalog_songs"."canonical_number" > 0),
	CONSTRAINT "reference_catalog_songs_id_non_empty" CHECK (btrim("reference_catalog_songs"."id") <> ''),
	CONSTRAINT "reference_catalog_songs_source_id_non_empty" CHECK (btrim("reference_catalog_songs"."source_id") <> ''),
	CONSTRAINT "reference_catalog_songs_title_non_empty" CHECK (btrim("reference_catalog_songs"."title") <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reference_catalog_songs_language_canonical_number_idx" ON "reference_catalog_songs" USING btree ("language","canonical_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "reference_catalog_songs_language_source_id_idx" ON "reference_catalog_songs" USING btree ("language","source_id");
