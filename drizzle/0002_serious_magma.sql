ALTER TABLE "service_contexts" ADD COLUMN "service_date" date DEFAULT CURRENT_DATE NOT NULL;--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "priest_id" text;--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "priest_display_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "organist_id" text;--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "organist_display_name" text DEFAULT '' NOT NULL;