import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DbReferenceAntiphonRecommendationClient, type ReferenceAntiphonRecommendationActor } from "../src/application/reference-antiphon-recommendation-client";
import { createNpmInvocation } from "./engineering-e1-core";

async function verifyBrowserActorEnvelope() {
  let capturedActor: ReferenceAntiphonRecommendationActor | null = null;
  const browserActor = { userId: "demo-admin-user", displayName: "Demo Admin User", role: "admin" as const };
  const client = new DbReferenceAntiphonRecommendationClient(browserActor, async (_action, _input, actor) => {
    capturedActor = actor;
    return { success: true, value: { antiphonId: "czech:800", recommendedSong: null } };
  });
  await client.get("czech:800");
  assert.deepEqual(capturedActor, { userId: "demo-admin-user", role: "admin" }, "browser actor envelope contains non-authoritative fields");
}

async function main() {
  await verifyBrowserActorEnvelope();
  const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", "test:phase-31-10b"]);
  const child = spawn(invocation.command, invocation.args, { env: process.env, stdio: "inherit" });
  child.on("error", (error) => { console.error(error); process.exitCode = 1; });
  child.on("close", (code) => {
    if (code !== 0) { process.exitCode = code ?? 1; return; }
    console.log("Phase 31.10B authoritative antiphon recommendation UI: PASS");
  });
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
