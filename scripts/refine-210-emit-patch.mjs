import { readFileSync, existsSync } from "node:fs";

// The repository CI creates db-migrate.log immediately before its final typecheck/test/build gate.
// Emit only there, not from nested historical verification suites that also invoke npm test.
if (!process.env.GITHUB_ACTIONS || !existsSync("db-migrate.log")) process.exit(0);

const paths = [
  "app/planning-lifecycle-client.tsx",
  "app/api/planning-lifecycle/route.ts",
  "app/admin/accounts/page.tsx",
  "src/application/planning-lifecycle/service.ts",
  "src/application/planning-lifecycle/index.ts",
  "src/application/reference-candidate-service.ts",
  "src/application/interaction-service.ts",
  "src/application/interaction-contracts.ts",
  "src/planning-lifecycle/ui-session.ts",
  "docs/requirements.md",
  "package.json",
];
const payload = Object.fromEntries(paths.map((path) => [path, readFileSync(path, "utf8")]));
const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
console.log(`REFINE_210_PATCH_PAYLOAD_BEGIN${encoded}REFINE_210_PATCH_PAYLOAD_END`);
