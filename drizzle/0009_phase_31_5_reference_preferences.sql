CREATE TABLE "reference_song_preferences" (
  "profile_id" text NOT NULL REFERENCES "preference_profiles"("id") ON DELETE CASCADE,
  "reference_id" text NOT NULL REFERENCES "reference_catalog_songs"("id") ON DELETE CASCADE,
  "score" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reference_song_preferences_score_range" CHECK ("score" >= 0 AND "score" <= 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reference_song_preferences_profile_reference_idx" ON "reference_song_preferences" ("profile_id", "reference_id");
