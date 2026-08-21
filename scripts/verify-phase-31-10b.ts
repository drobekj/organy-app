import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRecommendationPanelClients, type RecommendationPanelClientFactories } from "../app/reference-antiphon-recommendation-panel";
import { DbReferenceAntiphonRecommendationClient } from "../src/application/reference-antiphon-recommendation-client";
import { createNpmInvocation } from "./engineering-e1-core";

function verifyBrowserActorEnvelope() {
  let capturedActor: Parameters<RecommendationPanelClientFactories["recommendations"]>[0] | null = null;
  const browserActor = { userId: "demo-admin-user", displayName: "Demo Admin User", role: "admin" as const };
  const clients = createRecommendationPanelClients("db", browserActor, {
    antiphons: () => ({} as never),
    catalog: () => ({} as never),
    recommendations: (actor) => { capturedActor = actor; return {} as never; },
  });
  assert.ok(clients);
  assert.deepEqual(capturedActor, { userId: "demo-admin-user", role: "admin" }, "browser actor envelope contains non-authoritative fields");
}

async function verifyProtectedRecommendationTransport() {
  const calls: Array<{ action: string; input: unknown; actor: unknown }> = [];
  const client = new DbReferenceAntiphonRecommendationClient(
    { userId: "client-user-id-must-not-cross-boundary", role: "admin" },
    async (action, input, actor) => {
      calls.push({ action, input, actor });
      return { success: true, value: { antiphonId: "czech:800", recommendedSong: null } };
    },
  );

  await client.get("czech:800");
  await client.set("czech:800", "czech:1");

  assert.deepEqual(calls.map((call) => call.action), ["getReferenceAntiphonRecommendation", "setReferenceAntiphonRecommendation"]);
  assert.deepEqual(calls.map((call) => call.actor), [{ role: "admin" }, { role: "admin" }], "protected transport leaked client-supplied user identity");
  for (const call of calls) assert.equal(Object.prototype.hasOwnProperty.call(call.actor, "userId"), false, "protected transport included userId");
}

async function main() {
  verifyBrowserActorEnvelope();
  await verifyProtectedRecommendationTransport();
  const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", "test:phase-31-10b"]);
  const child = spawn(invocation.command, invocation.args, { env: process.env, stdio: "inherit" });
  child.on("error", (error) => { console.error(error); process.exitCode = 1; });
  child.on("close", (code) => {
    if (code !== 0) { process.exitCode = code ?? 1; return; }
    console.log("Phase 31.10B authoritative antiphon recommendation UI: PASS");
  });
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
