CREATE TYPE "public"."concrete_song_language" AS ENUM('czech', 'polish');--> statement-breakpoint
CREATE TYPE "public"."service_language" AS ENUM('czech', 'polish', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."service_set_status" AS ENUM('working', 'final');--> statement-breakpoint
CREATE TABLE "service_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"service_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_context_id" uuid NOT NULL,
	"status" "service_set_status" NOT NULL,
	"language" "service_language" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_set_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_set_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"song_number" text,
	"song_language" "concrete_song_language",
	"note" text,
	CONSTRAINT "service_set_rows_position_positive" CHECK ("service_set_rows"."position" > 0),
	CONSTRAINT "service_set_rows_song_complete_or_empty" CHECK (("service_set_rows"."song_number" is null and "service_set_rows"."song_language" is null) or ("service_set_rows"."song_number" is not null and "service_set_rows"."song_language" is not null))
);
--> statement-breakpoint
CREATE TABLE "completed_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_context_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"language" "service_language" NOT NULL,
	CONSTRAINT "completed_services_service_context_id_unique" UNIQUE("service_context_id")
);
--> statement-breakpoint
CREATE TABLE "completed_service_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"completed_service_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"song_number" text,
	"song_language" "concrete_song_language",
	"note" text,
	CONSTRAINT "completed_service_rows_position_positive" CHECK ("completed_service_rows"."position" > 0),
	CONSTRAINT "completed_service_rows_song_complete_or_empty" CHECK (("completed_service_rows"."song_number" is null and "completed_service_rows"."song_language" is null) or ("completed_service_rows"."song_number" is not null and "completed_service_rows"."song_language" is not null))
);
--> statement-breakpoint
ALTER TABLE "service_sets" ADD CONSTRAINT "service_sets_service_context_id_service_contexts_id_fk" FOREIGN KEY ("service_context_id") REFERENCES "public"."service_contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_set_rows" ADD CONSTRAINT "service_set_rows_service_set_id_service_sets_id_fk" FOREIGN KEY ("service_set_id") REFERENCES "public"."service_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_services" ADD CONSTRAINT "completed_services_service_context_id_service_contexts_id_fk" FOREIGN KEY ("service_context_id") REFERENCES "public"."service_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_service_rows" ADD CONSTRAINT "completed_service_rows_completed_service_id_completed_services_id_fk" FOREIGN KEY ("completed_service_id") REFERENCES "public"."completed_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_sets_context_status_unique" ON "service_sets" USING btree ("service_context_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "service_set_rows_set_position_unique" ON "service_set_rows" USING btree ("service_set_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "completed_service_rows_service_position_unique" ON "completed_service_rows" USING btree ("completed_service_id","position");
