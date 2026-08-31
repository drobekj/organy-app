ALTER TABLE "protected_account_actor_links"
  ADD COLUMN "whatsapp_phone_e164" text,
  ADD COLUMN "whatsapp_phone_confirmed_at" timestamp with time zone;

ALTER TABLE "protected_account_actor_links"
  ADD CONSTRAINT "protected_account_whatsapp_phone_state_valid"
  CHECK (
    ("whatsapp_phone_e164" IS NULL AND "whatsapp_phone_confirmed_at" IS NULL)
    OR
    (
      "whatsapp_phone_e164" ~ '^\+[1-9][0-9]{7,14}$'
      AND "whatsapp_phone_confirmed_at" IS NOT NULL
    )
  );
