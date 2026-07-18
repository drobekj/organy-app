import assert from "node:assert/strict";
import { cancelLookup, canAddOrPersistRows, canLeaveWorkspace, canManageKnowledge, canManageRepertoire, getCandidateSignal, getPreferenceShade, validateOwnPreferenceScore } from "../src/application/interaction-contracts";

assert.equal(validateOwnPreferenceScore("priest", 3), true);
assert.equal(validateOwnPreferenceScore("organist", 3), false);
assert.equal(validateOwnPreferenceScore("congregationMember", 2), false);
assert.equal(canManageRepertoire({ role: "organist", personId: "p1" }, "p1"), true);
assert.equal(canManageRepertoire({ role: "priest", personId: "p1" }, "p1"), false);
assert.equal(canManageKnowledge("admin"), true);
assert.equal(canManageKnowledge("organist"), false);
assert.equal(getCandidateSignal({ antiphonMatch: true, seasonMatch: true }), "antiphon");
assert.equal(getCandidateSignal({ antiphonMatch: false, seasonMatch: true }), "season");
assert.equal(getPreferenceShade(0), "none");
assert.equal(getPreferenceShade(3), "medium");
assert.equal(getPreferenceShade(6), "high");
assert.deepEqual(cancelLookup({ kind: "lookup", text: "demo", previous: { kind: "selected", songId: "s1" } }), { kind: "selected", songId: "s1" });
assert.equal(canAddOrPersistRows([{ kind: "lookup", text: "101" }]), false);
assert.equal(canLeaveWorkspace([{ kind: "lookup", text: "101" }]).allowed, false);
console.log("Phase 30.1 contract tests passed.");
