CREATE TABLE "reference_antiphon_recommendations" (
	"antiphon_id" text PRIMARY KEY NOT NULL,
	"reference_song_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_antiphons" (
	"id" text PRIMARY KEY NOT NULL,
	"language" "song_language" NOT NULL,
	"canonical_number" integer NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	CONSTRAINT "reference_antiphons_number_positive" CHECK ("reference_antiphons"."canonical_number" > 0),
	CONSTRAINT "reference_antiphons_id_matches_number" CHECK ("reference_antiphons"."id" = "reference_antiphons"."language"::text || ':' || "reference_antiphons"."canonical_number"::text),
	CONSTRAINT "reference_antiphons_id_non_empty" CHECK (btrim("reference_antiphons"."id") <> ''),
	CONSTRAINT "reference_antiphons_title_non_empty" CHECK (btrim("reference_antiphons"."title") <> ''),
	CONSTRAINT "reference_antiphons_source_url_valid" CHECK ((
    "reference_antiphons"."language" = 'czech' and "reference_antiphons"."source_url" is not null and "reference_antiphons"."source_url" ~ '^https://www\.evangelickykancional\.cz(?:/|$)'
  ) or (
    "reference_antiphons"."language" = 'polish' and ("reference_antiphons"."source_url" is null or "reference_antiphons"."source_url" ~ '^https://')
  ))
);
--> statement-breakpoint
CREATE TABLE "reference_melody_classes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_organist_repertoire" (
	"organist_person_id" text NOT NULL,
	"reference_song_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_song_melody_memberships" (
	"reference_song_id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_song_preferences" (
	"profile_id" text NOT NULL,
	"reference_song_id" text NOT NULL,
	"score" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_song_preferences_score_range" CHECK ("reference_song_preferences"."score" >= 0 and "reference_song_preferences"."score" <= 3)
);
--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email"),
	CONSTRAINT "auth_user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_user_actor_links" (
	"auth_user_id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "reference_antiphon_id" text;--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "reference_antiphon_display_number" text;--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "reference_antiphon_title" text;--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "reference_antiphon_source_url" text;--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "reference_topic_id" text;--> statement-breakpoint
ALTER TABLE "service_contexts" ADD COLUMN "reference_topic_title" text;--> statement-breakpoint
ALTER TABLE "reference_antiphon_recommendations" ADD CONSTRAINT "reference_antiphon_recommendations_antiphon_id_reference_antiphons_id_fk" FOREIGN KEY ("antiphon_id") REFERENCES "public"."reference_antiphons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_antiphon_recommendations" ADD CONSTRAINT "reference_antiphon_recommendations_reference_song_id_reference_catalog_songs_id_fk" FOREIGN KEY ("reference_song_id") REFERENCES "public"."reference_catalog_songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_organist_repertoire" ADD CONSTRAINT "reference_organist_repertoire_organist_person_id_catalog_persons_id_fk" FOREIGN KEY ("organist_person_id") REFERENCES "public"."catalog_persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_organist_repertoire" ADD CONSTRAINT "reference_organist_repertoire_reference_song_id_reference_catalog_songs_id_fk" FOREIGN KEY ("reference_song_id") REFERENCES "public"."reference_catalog_songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_song_melody_memberships" ADD CONSTRAINT "reference_song_melody_memberships_reference_song_id_reference_catalog_songs_id_fk" FOREIGN KEY ("reference_song_id") REFERENCES "public"."reference_catalog_songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_song_melody_memberships" ADD CONSTRAINT "reference_song_melody_memberships_class_id_reference_melody_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."reference_melody_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_song_preferences" ADD CONSTRAINT "reference_song_preferences_profile_id_preference_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."preference_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_song_preferences" ADD CONSTRAINT "reference_song_preferences_reference_song_id_reference_catalog_songs_id_fk" FOREIGN KEY ("reference_song_id") REFERENCES "public"."reference_catalog_songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_actor_links" ADD CONSTRAINT "auth_user_actor_links_auth_user_id_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_actor_links" ADD CONSTRAINT "auth_user_actor_links_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reference_antiphon_recommendations_song_id_idx" ON "reference_antiphon_recommendations" USING btree ("reference_song_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_antiphons_language_canonical_number_idx" ON "reference_antiphons" USING btree ("language","canonical_number");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_organist_repertoire_person_song_idx" ON "reference_organist_repertoire" USING btree ("organist_person_id","reference_song_id");--> statement-breakpoint
CREATE INDEX "reference_song_melody_memberships_class_id_idx" ON "reference_song_melody_memberships" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_song_preferences_profile_reference_song_idx" ON "reference_song_preferences" USING btree ("profile_id","reference_song_id");--> statement-breakpoint
CREATE INDEX "auth_account_userId_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_userId_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_actor_links_actor_user_idx" ON "auth_user_actor_links" USING btree ("actor_user_id");--> statement-breakpoint
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_snapshot_complete" CHECK ((
        "service_contexts"."reference_antiphon_id" is null and
        "service_contexts"."reference_antiphon_display_number" is null and
        "service_contexts"."reference_antiphon_title" is null and
        "service_contexts"."reference_antiphon_source_url" is null
      ) or (
        "service_contexts"."reference_antiphon_id" is not null and
        "service_contexts"."reference_antiphon_display_number" is not null and
        "service_contexts"."reference_antiphon_title" is not null
      ));--> statement-breakpoint
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_identity" CHECK ("service_contexts"."reference_antiphon_id" is null or "service_contexts"."reference_antiphon_id" ~ '^(czech|polish):[1-9][0-9]*$');--> statement-breakpoint
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_snapshot_non_empty" CHECK ("service_contexts"."reference_antiphon_id" is null or (
        btrim("service_contexts"."reference_antiphon_display_number") <> '' and
        btrim("service_contexts"."reference_antiphon_title") <> ''
      ));--> statement-breakpoint
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_source_url_valid" CHECK ("service_contexts"."reference_antiphon_source_url" is null or "service_contexts"."reference_antiphon_source_url" ~ '^https://');--> statement-breakpoint
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_topic_snapshot_complete" CHECK (("service_contexts"."reference_topic_id" is null and "service_contexts"."reference_topic_title" is null) or ("service_contexts"."reference_topic_id" is not null and "service_contexts"."reference_topic_title" is not null));--> statement-breakpoint
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_topic_identity" CHECK ("service_contexts"."reference_topic_id" is null or "service_contexts"."reference_topic_id" ~ '^(czech|polish):.+$');--> statement-breakpoint
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_topic_title_non_empty" CHECK ("service_contexts"."reference_topic_id" is null or btrim("service_contexts"."reference_topic_title") <> '');