CREATE TABLE "reference_thematic_parents" (
  "id" text PRIMARY KEY NOT NULL,
  "language" "song_language" NOT NULL,
  "title" text NOT NULL,
  "parent_id" text,
  "section_order" integer NOT NULL,
  "source_scan_page" integer NOT NULL,
  CONSTRAINT "reference_thematic_parents_parent_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "public"."reference_thematic_parents"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "reference_thematic_parents_id_non_empty" CHECK (btrim("id") <> ''),
  CONSTRAINT "reference_thematic_parents_title_non_empty" CHECK (btrim("title") <> ''),
  CONSTRAINT "reference_thematic_parents_order_positive" CHECK ("section_order" > 0),
  CONSTRAINT "reference_thematic_parents_scan_page_positive" CHECK ("source_scan_page" > 0),
  CONSTRAINT "reference_thematic_parents_id_language" CHECK ("id" LIKE ("language"::text || ':%'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reference_thematic_parents_language_order_idx"
  ON "reference_thematic_parents" USING btree ("language","section_order");
--> statement-breakpoint
CREATE TABLE "reference_thematic_sections" (
  "id" text PRIMARY KEY NOT NULL,
  "theme_key" text NOT NULL,
  "language" "song_language" NOT NULL,
  "title" text NOT NULL,
  "parent_id" text NOT NULL,
  "section_order" integer NOT NULL,
  "source_scan_page" integer NOT NULL,
  "source_printed_page" integer NOT NULL,
  CONSTRAINT "reference_thematic_sections_parent_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "public"."reference_thematic_parents"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "reference_thematic_sections_id_non_empty" CHECK (btrim("id") <> ''),
  CONSTRAINT "reference_thematic_sections_theme_key_non_empty" CHECK (btrim("theme_key") <> ''),
  CONSTRAINT "reference_thematic_sections_title_non_empty" CHECK (btrim("title") <> ''),
  CONSTRAINT "reference_thematic_sections_order_positive" CHECK ("section_order" > 0),
  CONSTRAINT "reference_thematic_sections_scan_page_positive" CHECK ("source_scan_page" > 0),
  CONSTRAINT "reference_thematic_sections_printed_page_positive" CHECK ("source_printed_page" > 0),
  CONSTRAINT "reference_thematic_sections_id_language" CHECK ("id" LIKE ("language"::text || ':%'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reference_thematic_sections_language_order_idx"
  ON "reference_thematic_sections" USING btree ("language","section_order");
--> statement-breakpoint
CREATE INDEX "reference_thematic_sections_theme_key_idx"
  ON "reference_thematic_sections" USING btree ("theme_key");
--> statement-breakpoint
CREATE TABLE "reference_thematic_ranges" (
  "section_id" text NOT NULL,
  "range_order" integer NOT NULL,
  "from_number" integer NOT NULL,
  "to_number" integer NOT NULL,
  CONSTRAINT "reference_thematic_ranges_pk" PRIMARY KEY("section_id","range_order"),
  CONSTRAINT "reference_thematic_ranges_section_id_fk"
    FOREIGN KEY ("section_id") REFERENCES "public"."reference_thematic_sections"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "reference_thematic_ranges_order_positive" CHECK ("range_order" > 0),
  CONSTRAINT "reference_thematic_ranges_from_positive" CHECK ("from_number" > 0),
  CONSTRAINT "reference_thematic_ranges_to_positive" CHECK ("to_number" > 0),
  CONSTRAINT "reference_thematic_ranges_ordered" CHECK ("from_number" <= "to_number")
);
--> statement-breakpoint
CREATE INDEX "reference_thematic_ranges_bounds_idx"
  ON "reference_thematic_ranges" USING btree ("from_number","to_number");
