ALTER TABLE "melody_non_repetition_config" ADD COLUMN IF NOT EXISTS "months" integer DEFAULT 2 NOT NULL;
UPDATE "melody_non_repetition_config" SET "months" = 2 WHERE "id" = 'global';
ALTER TABLE "melody_non_repetition_config" DROP CONSTRAINT IF EXISTS "melody_non_repetition_config_non_negative";
ALTER TABLE "melody_non_repetition_config" ADD CONSTRAINT "melody_non_repetition_config_non_negative" CHECK ("months" >= 0);
