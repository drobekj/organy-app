CREATE TYPE "congregation_voter_status" AS ENUM ('pending', 'active', 'legacy_unverified');

CREATE TABLE "congregation_voter_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "nickname" text NOT NULL,
  "nickname_normalized" text NOT NULL,
  "email" text,
  "email_normalized" text,
  "status" "congregation_voter_status" NOT NULL,
  "is_new_registration" boolean DEFAULT true NOT NULL,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "congregation_voter_accounts_state_valid" CHECK ((
    ("status" = 'pending' and "user_id" is null and "email" is not null and "email_normalized" is not null and "confirmed_at" is null)
    or
    ("status" = 'active' and "user_id" is not null and "email" is not null and "email_normalized" is not null and "confirmed_at" is not null)
    or
    ("status" = 'legacy_unverified' and "user_id" is not null and "confirmed_at" is null and (("email" is null and "email_normalized" is null) or ("email" is not null and "email_normalized" is not null)))
  )),
  CONSTRAINT "congregation_voter_accounts_nickname_not_empty" CHECK (btrim("nickname") <> '' and btrim("nickname_normalized") <> ''),
  CONSTRAINT "congregation_voter_accounts_email_pair" CHECK (("email" is null) = ("email_normalized" is null))
);

ALTER TABLE "congregation_voter_accounts"
  ADD CONSTRAINT "congregation_voter_accounts_user_id_app_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "congregation_voter_accounts_user_idx" ON "congregation_voter_accounts" USING btree ("user_id");
CREATE UNIQUE INDEX "congregation_voter_accounts_nickname_normalized_idx" ON "congregation_voter_accounts" USING btree ("nickname_normalized");
CREATE UNIQUE INDEX "congregation_voter_accounts_email_normalized_idx" ON "congregation_voter_accounts" USING btree ("email_normalized");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "app_users" u
     WHERE u.id LIKE 'congregation-voter:%'
       AND (
         NOT u.active
         OR btrim(u.display_name) = ''
         OR EXISTS (SELECT 1 FROM "protected_account_actor_links" l WHERE l.app_user_id = u.id)
         OR (SELECT count(*) FROM "app_user_roles" r WHERE r.user_id = u.id) <> 1
         OR NOT EXISTS (SELECT 1 FROM "app_user_roles" r WHERE r.user_id = u.id AND r.role = 'congregation_member')
         OR (SELECT count(*) FROM "preference_profiles" p WHERE p.user_id = u.id AND p.category = 'congregation_member') <> 1
       )
  ) THEN
    RAISE EXCEPTION 'Unsafe legacy congregation voter shape; migration requires explicit resolution';
  END IF;

  IF EXISTS (
    SELECT lower(btrim(u.display_name))
      FROM "app_users" u
     WHERE u.id LIKE 'congregation-voter:%'
     GROUP BY lower(btrim(u.display_name))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Case-insensitive legacy congregation nickname collision; migration requires explicit resolution';
  END IF;
END $$;

INSERT INTO "congregation_voter_accounts"
  ("id", "user_id", "nickname", "nickname_normalized", "status", "is_new_registration", "created_at", "updated_at")
SELECT
  'congregation-account:legacy:' || substring(u.id from length('congregation-voter:') + 1),
  u.id,
  u.display_name,
  lower(btrim(u.display_name)),
  'legacy_unverified',
  false,
  u.created_at,
  now()
FROM "app_users" u
JOIN "preference_profiles" pp ON pp.user_id = u.id AND pp.category = 'congregation_member'
WHERE u.id LIKE 'congregation-voter:%'
  AND u.active = true
  AND NOT EXISTS (SELECT 1 FROM "protected_account_actor_links" l WHERE l.app_user_id = u.id)
  AND (SELECT count(*) FROM "app_user_roles" r WHERE r.user_id = u.id) = 1
  AND EXISTS (SELECT 1 FROM "app_user_roles" r WHERE r.user_id = u.id AND r.role = 'congregation_member');

CREATE TABLE "congregation_confirmation_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "invalidated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "congregation_confirmation_tokens_terminal_state" CHECK (not ("used_at" is not null and "invalidated_at" is not null))
);

ALTER TABLE "congregation_confirmation_tokens"
  ADD CONSTRAINT "congregation_confirmation_tokens_account_id_congregation_voter_accounts_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "public"."congregation_voter_accounts"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "congregation_confirmation_tokens_hash_idx" ON "congregation_confirmation_tokens" USING btree ("token_hash");
CREATE INDEX "congregation_confirmation_tokens_account_idx" ON "congregation_confirmation_tokens" USING btree ("account_id");

CREATE TABLE "congregation_voter_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "congregation_voter_sessions"
  ADD CONSTRAINT "congregation_voter_sessions_account_id_congregation_voter_accounts_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "public"."congregation_voter_accounts"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "congregation_voter_sessions_hash_idx" ON "congregation_voter_sessions" USING btree ("token_hash");
CREATE INDEX "congregation_voter_sessions_account_idx" ON "congregation_voter_sessions" USING btree ("account_id");

CREATE TABLE "congregation_rate_limit_buckets" (
  "id" text PRIMARY KEY NOT NULL,
  "action" text NOT NULL,
  "scope" text NOT NULL,
  "key_hash" text NOT NULL,
  "bucket_start" timestamp with time zone NOT NULL,
  "request_count" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "congregation_rate_limit_request_count_positive" CHECK ("request_count" > 0)
);

CREATE UNIQUE INDEX "congregation_rate_limit_bucket_idx" ON "congregation_rate_limit_buckets" USING btree ("action", "scope", "key_hash", "bucket_start");

CREATE TABLE "congregation_registration_control" (
  "id" text PRIMARY KEY NOT NULL,
  "registration_frozen" boolean DEFAULT false NOT NULL,
  "bootstrap_completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "congregation_registration_control_singleton" CHECK ("id" = 'global')
);

INSERT INTO "congregation_registration_control" ("id") VALUES ('global');
