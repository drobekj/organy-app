ALTER TABLE "reference_antiphons" ALTER COLUMN "source_url" DROP NOT NULL;
ALTER TABLE "reference_antiphons" DROP CONSTRAINT IF EXISTS "reference_antiphons_source_url_valid";
ALTER TABLE "reference_antiphons" ADD CONSTRAINT "reference_antiphons_source_url_valid" CHECK (
  ("language" = 'czech' AND "source_url" IS NOT NULL AND "source_url" ~ '^https://www\.evangelickykancional\.cz(?:/|$)') OR
  ("language" = 'polish' AND ("source_url" IS NULL OR "source_url" ~ '^https://'))
);

ALTER TABLE "service_contexts" DROP CONSTRAINT IF EXISTS "service_contexts_reference_antiphon_snapshot_complete";
ALTER TABLE "service_contexts" DROP CONSTRAINT IF EXISTS "service_contexts_reference_antiphon_identity";
ALTER TABLE "service_contexts" DROP CONSTRAINT IF EXISTS "service_contexts_reference_antiphon_snapshot_non_empty";
ALTER TABLE "service_contexts" DROP CONSTRAINT IF EXISTS "service_contexts_reference_antiphon_source_url_valid";

ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_snapshot_complete" CHECK (
  ("reference_antiphon_id" IS NULL AND "reference_antiphon_display_number" IS NULL AND "reference_antiphon_title" IS NULL AND "reference_antiphon_source_url" IS NULL) OR
  ("reference_antiphon_id" IS NOT NULL AND "reference_antiphon_display_number" IS NOT NULL AND "reference_antiphon_title" IS NOT NULL)
);
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_identity" CHECK (
  "reference_antiphon_id" IS NULL OR "reference_antiphon_id" ~ '^(czech|polish):[1-9][0-9]*$'
);
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_snapshot_non_empty" CHECK (
  "reference_antiphon_id" IS NULL OR (btrim("reference_antiphon_display_number") <> '' AND btrim("reference_antiphon_title") <> '')
);
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_source_url_valid" CHECK (
  "reference_antiphon_source_url" IS NULL OR "reference_antiphon_source_url" ~ '^https://'
);
