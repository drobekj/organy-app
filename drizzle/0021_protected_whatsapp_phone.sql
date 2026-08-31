ALTER TABLE "app_users" ADD COLUMN "whatsapp_phone_e164" text;
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_whatsapp_phone_e164_valid" CHECK (
  "whatsapp_phone_e164" is null or "whatsapp_phone_e164" ~ '^\+[1-9][0-9]{7,14}$'
);
