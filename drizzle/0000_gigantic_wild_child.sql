CREATE TYPE "public"."service_set_status" AS ENUM('working', 'final');--> statement-breakpoint
CREATE TYPE "public"."song_language" AS ENUM('czech', 'polish');--> statement-breakpoint
CREATE TABLE "completed_service_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"completed_service_id" integer NOT NULL,
	"position" integer NOT NULL,
	"song_language" "song_language",
	"song_number" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completed_service_rows_position_positive" CHECK ("completed_service_rows"."position" > 0),
	CONSTRAINT "completed_service_rows_complete_song_reference" CHECK (("completed_service_rows"."song_language" is null and "completed_service_rows"."song_number" is null) or ("completed_service_rows"."song_language" is not null and "completed_service_rows"."song_number" is not null))
);
--> statement-breakpoint
CREATE TABLE "completed_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_context_id" integer NOT NULL,
	"service_set_id" integer,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_contexts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_set_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_set_id" integer NOT NULL,
	"position" integer NOT NULL,
	"song_language" "song_language",
	"song_number" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_set_rows_position_positive" CHECK ("service_set_rows"."position" > 0),
	CONSTRAINT "service_set_rows_complete_song_reference" CHECK (("service_set_rows"."song_language" is null and "service_set_rows"."song_number" is null) or ("service_set_rows"."song_language" is not null and "service_set_rows"."song_number" is not null))
);
--> statement-breakpoint
CREATE TABLE "service_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_context_id" integer NOT NULL,
	"status" "service_set_status" DEFAULT 'working' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "completed_service_rows" ADD CONSTRAINT "completed_service_rows_completed_service_id_completed_services_id_fk" FOREIGN KEY ("completed_service_id") REFERENCES "public"."completed_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_services" ADD CONSTRAINT "completed_services_service_context_id_service_contexts_id_fk" FOREIGN KEY ("service_context_id") REFERENCES "public"."service_contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_services" ADD CONSTRAINT "completed_services_service_set_id_service_sets_id_fk" FOREIGN KEY ("service_set_id") REFERENCES "public"."service_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_set_rows" ADD CONSTRAINT "service_set_rows_service_set_id_service_sets_id_fk" FOREIGN KEY ("service_set_id") REFERENCES "public"."service_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_sets" ADD CONSTRAINT "service_sets_service_context_id_service_contexts_id_fk" FOREIGN KEY ("service_context_id") REFERENCES "public"."service_contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "completed_service_rows_completed_service_id_position_idx" ON "completed_service_rows" USING btree ("completed_service_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "service_set_rows_service_set_id_position_idx" ON "service_set_rows" USING btree ("service_set_id","position");