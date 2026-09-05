import type { Pool } from "pg";
import { resolveApplicationExperience } from "../config/application-experience";
import { assertCongregationEmailRuntimeConfig } from "../config/production-runtime";
import { PostgresCongregationPreferenceService } from "./congregation-preference-voter";
import { ResendCongregationVoterMailer } from "./congregation-voter-mailer";

export function createRuntimeCongregationPreferenceService(pool: Pool): PostgresCongregationPreferenceService {
  if (resolveApplicationExperience() === "demo") {
    throw new Error("Demo must not initialize congregation registration or email infrastructure.");
  }
  if (process.env.NODE_ENV === "production") {
    assertCongregationEmailRuntimeConfig(process.env);
  }
  return new PostgresCongregationPreferenceService(pool, {
    mailer: new ResendCongregationVoterMailer(required("RESEND_API_KEY"), required("CONGREGATION_EMAIL_FROM")),
    canonicalBaseUrl: required("CONGREGATION_BASE_URL"),
    securitySecret: required("CONGREGATION_SECURITY_SECRET"),
  });
}

function required(key: "RESEND_API_KEY" | "CONGREGATION_EMAIL_FROM" | "CONGREGATION_BASE_URL" | "CONGREGATION_SECURITY_SECRET"): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required for congregation registration.`);
  return value;
}
