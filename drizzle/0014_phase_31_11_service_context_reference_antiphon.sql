ALTER TABLE "service_contexts" ADD COLUMN IF NOT EXISTS "reference_antiphon_id" text;
ALTER TABLE "service_contexts" ADD COLUMN IF NOT EXISTS "reference_antiphon_display_number" text;
ALTER TABLE "service_contexts" ADD COLUMN IF NOT EXISTS "reference_antiphon_title" text;
ALTER TABLE "service_contexts" ADD COLUMN IF NOT EXISTS "reference_antiphon_source_url" text;

DO $$ BEGIN
  ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_snapshot_complete" CHECK (
    ("reference_antiphon_id" IS NULL AND "reference_antiphon_display_number" IS NULL AND "reference_antiphon_title" IS NULL AND "reference_antiphon_source_url" IS NULL) OR
    ("reference_antiphon_id" IS NOT NULL AND "reference_antiphon_display_number" IS NOT NULL AND "reference_antiphon_title" IS NOT NULL AND "reference_antiphon_source_url" IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_identity" CHECK (
    "reference_antiphon_id" IS NULL OR "reference_antiphon_id" ~ '^czech:(8[0-9]{2}|90[0-9]|91[0-5])$'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_snapshot_non_empty" CHECK (
    "reference_antiphon_id" IS NULL OR (
      btrim("reference_antiphon_display_number") <> '' AND
      btrim("reference_antiphon_title") <> '' AND
      btrim("reference_antiphon_source_url") <> ''
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_source_url_valid" CHECK (
    "reference_antiphon_source_url" IS NULL OR "reference_antiphon_source_url" ~ '^https://www\.evangelickykancional\.cz(?:/|$)'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
