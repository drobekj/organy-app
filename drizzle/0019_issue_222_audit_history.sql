CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" text,
	"actor_display_name" text,
	"actor_role" text,
	"actor_person_id" text,
	"action" text NOT NULL,
	"object_kind" text NOT NULL,
	"object_ref" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	CONSTRAINT "audit_events_actor_kind_valid" CHECK ("audit_events"."actor_kind" in ('human', 'system')),
	CONSTRAINT "audit_events_actor_snapshot_valid" CHECK ((
    "audit_events"."actor_kind" = 'system' and "audit_events"."actor_user_id" is null and "audit_events"."actor_display_name" is null and "audit_events"."actor_role" is null
  ) or (
    "audit_events"."actor_kind" = 'human' and "audit_events"."actor_user_id" is not null and btrim("audit_events"."actor_user_id") <> '' and
    "audit_events"."actor_display_name" is not null and btrim("audit_events"."actor_display_name") <> '' and
    "audit_events"."actor_role" is not null and btrim("audit_events"."actor_role") <> ''
  )),
	CONSTRAINT "audit_events_action_non_empty" CHECK (btrim("audit_events"."action") <> ''),
	CONSTRAINT "audit_events_object_kind_non_empty" CHECK (btrim("audit_events"."object_kind") <> ''),
	CONSTRAINT "audit_events_object_ref_non_empty" CHECK (btrim("audit_events"."object_ref") <> '')
);
--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_object_idx" ON "audit_events" USING btree ("object_kind","object_ref");