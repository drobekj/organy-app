CREATE TABLE "reference_antiphon_recommendations" (
	"antiphon_id" text PRIMARY KEY NOT NULL,
	"reference_song_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reference_antiphon_recommendations" ADD CONSTRAINT "reference_antiphon_recommendations_antiphon_fk" FOREIGN KEY ("antiphon_id") REFERENCES "public"."reference_antiphons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "reference_antiphon_recommendations" ADD CONSTRAINT "reference_antiphon_recommendations_song_fk" FOREIGN KEY ("reference_song_id") REFERENCES "public"."reference_catalog_songs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "reference_antiphon_recommendations_song_id_idx" ON "reference_antiphon_recommendations" USING btree ("reference_song_id");
