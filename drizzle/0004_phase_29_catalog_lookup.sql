CREATE TABLE IF NOT EXISTS "catalog_persons" (
  "id" text PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "priest" boolean DEFAULT false NOT NULL,
  "organist" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "catalog_songs" (
  "song_id" text PRIMARY KEY NOT NULL,
  "language" "song_language" NOT NULL,
  "number" text NOT NULL,
  "title" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sheet_music_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_songs_language_number_idx" ON "catalog_songs" ("language","number");
ALTER TABLE "service_set_rows" ADD COLUMN IF NOT EXISTS "song_id" text;
ALTER TABLE "service_set_rows" ADD COLUMN IF NOT EXISTS "song_title" text;
ALTER TABLE "completed_service_rows" ADD COLUMN IF NOT EXISTS "song_id" text;
ALTER TABLE "completed_service_rows" ADD COLUMN IF NOT EXISTS "song_title" text;
CREATE INDEX IF NOT EXISTS "catalog_persons_priest_lookup_idx" ON "catalog_persons" ("active","priest");
CREATE INDEX IF NOT EXISTS "catalog_persons_organist_lookup_idx" ON "catalog_persons" ("active","organist");
CREATE INDEX IF NOT EXISTS "catalog_songs_active_language_idx" ON "catalog_songs" ("active","language");
