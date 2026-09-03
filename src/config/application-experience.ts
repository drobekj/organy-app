import type { ExperienceMode } from "../application/demo-safety";

export const APPLICATION_EXPERIENCE_KEY = "ORGANY_EXPERIENCE" as const;
export type ApplicationExperienceEnvironment = Record<string, string | undefined>;

export const DEMO_FORBIDDEN_RUNTIME_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CRON_SECRET",
  "NEON_API_KEY",
  "RESEND_API_KEY",
  "CONGREGATION_EMAIL_FROM",
  "CONGREGATION_BASE_URL",
  "CONGREGATION_SECURITY_SECRET",
] as const;

export type DemoForbiddenRuntimeKey = (typeof DEMO_FORBIDDEN_RUNTIME_KEYS)[number];
export type DemoRuntimeIssue = { key: string; reason: string };

export class ApplicationExperienceConfigError extends Error {
  constructor(readonly issues: DemoRuntimeIssue[]) {
    super("Application experience configuration is invalid.");
    this.name = "ApplicationExperienceConfigError";
  }
}

export function resolveApplicationExperience(
  env: ApplicationExperienceEnvironment = process.env,
): ExperienceMode {
  const value = env[APPLICATION_EXPERIENCE_KEY]?.trim() ?? "";
  if (!value || value === "standard") return "standard";
  if (value === "demo") return "demo";
  throw new ApplicationExperienceConfigError([
    { key: APPLICATION_EXPERIENCE_KEY, reason: "must be standard or demo" },
  ]);
}

export function validateDemoRuntimeConfig(
  env: ApplicationExperienceEnvironment,
): DemoRuntimeIssue[] {
  const issues: DemoRuntimeIssue[] = [];

  try {
    if (resolveApplicationExperience(env) !== "demo") {
      issues.push({ key: APPLICATION_EXPERIENCE_KEY, reason: "must be demo for the isolated Demo runtime" });
    }
  } catch (error) {
    if (error instanceof ApplicationExperienceConfigError) issues.push(...error.issues);
    else throw error;
  }

  if ((env.ORGANY_RUNTIME?.trim() ?? "") !== "memory") {
    issues.push({ key: "ORGANY_RUNTIME", reason: "must be memory for the isolated Demo runtime" });
  }

  for (const key of DEMO_FORBIDDEN_RUNTIME_KEYS) {
    if (env[key]?.trim()) {
      issues.push({ key, reason: "must not be configured in the isolated Demo runtime" });
    }
  }

  return issues;
}

export function assertDemoRuntimeConfig(
  env: ApplicationExperienceEnvironment = process.env,
): void {
  const issues = validateDemoRuntimeConfig(env);
  if (issues.length > 0) throw new ApplicationExperienceConfigError(issues);
}
