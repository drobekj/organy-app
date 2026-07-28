CREATE TABLE "reference_organist_repertoire" (
  "organist_person_id" text NOT NULL REFERENCES "catalog_persons"("id") ON DELETE CASCADE,
  "reference_song_id" text NOT NULL REFERENCES "reference_catalog_songs"("id") ON DELETE CASCADE,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reference_organist_repertoire_person_song_idx" ON "reference_organist_repertoire" ("organist_person_id", "reference_song_id");
