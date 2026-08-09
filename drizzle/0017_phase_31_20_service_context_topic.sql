ALTER TABLE "service_contexts" ADD COLUMN "reference_topic_id" text;
ALTER TABLE "service_contexts" ADD COLUMN "reference_topic_title" text;

ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_topic_snapshot_complete" CHECK (
  ("reference_topic_id" IS NULL AND "reference_topic_title" IS NULL) OR
  ("reference_topic_id" IS NOT NULL AND "reference_topic_title" IS NOT NULL)
);
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_topic_identity" CHECK (
  "reference_topic_id" IS NULL OR "reference_topic_id" ~ '^(czech|polish):.+$'
);
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_topic_title_non_empty" CHECK (
  "reference_topic_id" IS NULL OR btrim("reference_topic_title") <> ''
);
