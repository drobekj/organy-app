import { readFileSync, writeFileSync, rmSync } from "node:fs";
const path = "scripts/verify-phase-31-4.ts";
const source = readFileSync(path, "utf8");
const before = "      let restoreInteractionPool = () => undefined;";
const after = "      let restoreInteractionPool: () => void = () => undefined;";
if ((source.split(before).length - 1) !== 1) throw new Error("Expected exactly one restoreInteractionPool declaration.");
writeFileSync(path, source.replace(before, after));
rmSync("scripts/phase-31-28-fix-verify-type.mjs", { force: true });
rmSync(".github/workflows/phase-31-28-fix-verify-type.yml", { force: true });
