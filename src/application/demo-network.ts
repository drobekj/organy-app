export const PRODUCTION_APP_HOSTS = new Set([
  "organy-app.vercel.app",
  "organy-app-drobekjs-projects.vercel.app",
]);

export const DEMO_NETWORK_DENIED_CODE = "demoNetworkDenied" as const;

export class DemoNetworkDeniedError extends Error {
  readonly code = DEMO_NETWORK_DENIED_CODE;

  constructor(readonly target: string) {
    super(`Demo runtime cannot access protected application network target '${target}'.`);
    this.name = "DemoNetworkDeniedError";
  }
}

export function assertDemoNetworkTargetAllowed(
  target: string | URL,
  demoOrigin = "https://demo.invalid",
): void {
  const url = target instanceof URL ? target : new URL(target, demoOrigin);

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    throw new DemoNetworkDeniedError(url.toString());
  }

  if (PRODUCTION_APP_HOSTS.has(url.hostname.toLowerCase())) {
    throw new DemoNetworkDeniedError(url.toString());
  }
}
