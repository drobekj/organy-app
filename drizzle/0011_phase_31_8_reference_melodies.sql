CREATE TABLE "reference_melody_classes" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_song_melody_memberships" (
  "reference_song_id" text PRIMARY KEY NOT NULL,
  "class_id" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reference_song_melody_memberships_song_fk" FOREIGN KEY ("reference_song_id") REFERENCES "reference_catalog_songs"("id") ON DELETE CASCADE,
  CONSTRAINT "reference_song_melody_memberships_class_fk" FOREIGN KEY ("class_id") REFERENCES "reference_melody_classes"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "reference_song_melody_memberships_class_id_idx" ON "reference_song_melody_memberships" ("class_id");
--> statement-breakpoint
INSERT INTO "reference_melody_classes" ("id") SELECT 'reference-melody:' || "id" FROM "reference_catalog_songs" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "reference_song_melody_memberships" ("reference_song_id", "class_id") SELECT "id", 'reference-melody:' || "id" FROM "reference_catalog_songs" ON CONFLICT DO NOTHING;
