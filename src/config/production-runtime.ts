export const PRODUCTION_RUNTIME_KEYS = [
  "ORGANY_RUNTIME",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
] as const;

export type ProductionRuntimeKey = typeof PRODUCTION_RUNTIME_KEYS[number];
export type RuntimeEnvironment = Record<string, string | undefined>;
export type ProductionRuntimeIssue = { key: ProductionRuntimeKey; reason: string };
export type ApplicationRuntimeMode = "db" | "memory";

const KNOWN_SECRET_PLACEHOLDER = "organy-build-placeholder-secret-not-for-runtime";

export class ProductionRuntimeConfigError extends Error {
  constructor(readonly issues: ProductionRuntimeIssue[]) {
    super("Production runtime configuration is invalid.");
    this.name = "ProductionRuntimeConfigError";
  }
}

export function validateProductionRuntimeConfig(env: RuntimeEnvironment): ProductionRuntimeIssue[] {
  const issues: ProductionRuntimeIssue[] = [];

  if (read(env, "ORGANY_RUNTIME") !== "db") {
    issues.push({ key: "ORGANY_RUNTIME", reason: "must be set to db for production runtime" });
  }

  if (!read(env, "DATABASE_URL")) {
    issues.push({ key: "DATABASE_URL", reason: "is required and must not be blank" });
  }

  const secret = read(env, "BETTER_AUTH_SECRET");
  if (!secret) {
    issues.push({ key: "BETTER_AUTH_SECRET", reason: "is required and must not be blank" });
  } else if (secret.length < 32) {
    issues.push({ key: "BETTER_AUTH_SECRET", reason: "must contain at least 32 characters" });
  } else if (isKnownPlaceholderSecret(secret)) {
    issues.push({ key: "BETTER_AUTH_SECRET", reason: "must not use a known placeholder value" });
  }

  const authUrlText = read(env, "BETTER_AUTH_URL");
  if (!authUrlText) {
    issues.push({ key: "BETTER_AUTH_URL", reason: "is required and must not be blank" });
  } else {
    const authUrl = parseAbsoluteUrl(authUrlText);
    if (!authUrl) {
      issues.push({ key: "BETTER_AUTH_URL", reason: "must be a valid absolute http(s) URL" });
    } else if (authUrl.protocol !== "https:" && authUrl.protocol !== "http:") {
      issues.push({ key: "BETTER_AUTH_URL", reason: "must use https, except loopback local acceptance may use http" });
    } else if (authUrl.protocol === "http:" && !isLoopbackHostname(authUrl.hostname)) {
      issues.push({ key: "BETTER_AUTH_URL", reason: "public/non-loopback URLs must use https" });
    }
  }

  return issues;
}

export function assertProductionRuntimeConfig(env: RuntimeEnvironment = process.env): void {
  const issues = validateProductionRuntimeConfig(env);
  if (issues.length > 0) throw new ProductionRuntimeConfigError(issues);
}

export function resolveApplicationRuntimeMode(
  env: RuntimeEnvironment = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): ApplicationRuntimeMode {
  if (nodeEnv === "production") {
    assertProductionRuntimeConfig(env);
    return "db";
  }
  return read(env, "ORGANY_RUNTIME") === "db" ? "db" : "memory";
}

export function formatProductionRuntimeIssues(issues: ProductionRuntimeIssue[]): string[] {
  return issues.map((issue) => `${issue.key}: ${issue.reason}`);
}

function read(env: RuntimeEnvironment, key: ProductionRuntimeKey): string {
  return env[key]?.trim() ?? "";
}

function isKnownPlaceholderSecret(secret: string): boolean {
  if (secret === KNOWN_SECRET_PLACEHOLDER) return true;
  return /(?:placeholder|change[-_ ]?me|replace[-_ ]?me|example[-_ ]?secret)/i.test(secret);
}

function parseAbsoluteUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    if (!parsed.protocol || !parsed.hostname) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
