CREATE TABLE "reference_antiphons" (
  "id" text PRIMARY KEY NOT NULL,
  "language" "song_language" NOT NULL,
  "canonical_number" integer NOT NULL,
  "title" text NOT NULL,
  "source_url" text NOT NULL,
  CONSTRAINT "reference_antiphons_number_positive" CHECK ("canonical_number" > 0),
  CONSTRAINT "reference_antiphons_id_matches_number" CHECK ("id" = "language"::text || ':' || "canonical_number"::text),
  CONSTRAINT "reference_antiphons_id_non_empty" CHECK (btrim("id") <> ''),
  CONSTRAINT "reference_antiphons_title_non_empty" CHECK (btrim("title") <> ''),
  CONSTRAINT "reference_antiphons_source_url_valid" CHECK ("source_url" ~ '^https://www\.evangelickykancional\.cz(?:/|$)')
);
CREATE UNIQUE INDEX "reference_antiphons_language_canonical_number_idx" ON "reference_antiphons" ("language", "canonical_number");
