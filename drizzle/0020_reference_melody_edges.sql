CREATE TABLE "reference_melody_edges" (
  "song_a_id" text NOT NULL,
  "song_b_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reference_melody_edges_song_a_fk" FOREIGN KEY ("song_a_id") REFERENCES "reference_catalog_songs"("id") ON DELETE CASCADE,
  CONSTRAINT "reference_melody_edges_song_b_fk" FOREIGN KEY ("song_b_id") REFERENCES "reference_catalog_songs"("id") ON DELETE CASCADE,
  CONSTRAINT "reference_melody_edges_canonical_pair" CHECK ("song_a_id" < "song_b_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reference_melody_edges_pair_idx" ON "reference_melody_edges" ("song_a_id", "song_b_id");
--> statement-breakpoint
CREATE INDEX "reference_melody_edges_song_b_idx" ON "reference_melody_edges" ("song_b_id");
