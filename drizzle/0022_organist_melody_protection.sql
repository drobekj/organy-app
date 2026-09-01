ALTER TABLE "catalog_persons"
  ADD COLUMN "melody_protection_months" integer DEFAULT 2 NOT NULL;

ALTER TABLE "catalog_persons"
  ADD CONSTRAINT "catalog_persons_melody_protection_months_range"
  CHECK ("melody_protection_months" BETWEEN 0 AND 12);

ALTER TABLE "service_contexts"
  ADD COLUMN "melody_protection_months" integer DEFAULT 2 NOT NULL;

ALTER TABLE "service_contexts"
  ADD CONSTRAINT "service_contexts_melody_protection_months_range"
  CHECK ("melody_protection_months" BETWEEN 0 AND 12);
