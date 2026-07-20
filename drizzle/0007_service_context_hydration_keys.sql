ALTER TABLE "service_contexts" ADD COLUMN IF NOT EXISTS "antiphon_key" text;
ALTER TABLE "service_contexts" ADD COLUMN IF NOT EXISTS "liturgical_season_key" text;
UPDATE "service_contexts" SET "antiphon_key" = NULL WHERE btrim(coalesce("antiphon_key", '')) = '';
UPDATE "service_contexts" SET "liturgical_season_key" = NULL WHERE btrim(coalesce("liturgical_season_key", '')) = '';
