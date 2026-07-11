ALTER TABLE "service_contexts" ADD COLUMN "service_time" time;
CREATE UNIQUE INDEX "service_contexts_service_date_time_idx" ON "service_contexts" ("service_date", "service_time");
