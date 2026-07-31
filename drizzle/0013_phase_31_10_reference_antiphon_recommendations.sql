CREATE TABLE "reference_antiphon_recommendations" (
  "antiphon_id" text PRIMARY KEY NOT NULL REFERENCES "reference_antiphons"("id") ON DELETE CASCADE,
  "reference_song_id" text NOT NULL REFERENCES "reference_catalog_songs"("id") ON DELETE CASCADE,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "reference_antiphon_recommendations_song_idx" ON "reference_antiphon_recommendations" ("reference_song_id");
