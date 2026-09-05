import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { congregationAdminVoterLabel } from "../src/application/congregation-voter-admin-label";

const userId = "congregation-voter:temporary:3e1c4a7b-9d11-4e55-8f9a-12ab34cd56ef";
const accountId = "congregation-account:temporary:3e1c4a7b-9d11-4e55-8f9a-12ab34cd56ef";
const rawUuid = "3e1c4a7b-9d11-4e55-8f9a-12ab34cd56ef";

assert.equal(congregationAdminVoterLabel(userId, "Anonymous voter"), "Anonymous voter · 3E1C4A7B");
assert.equal(congregationAdminVoterLabel(accountId, `Temporary voter ${rawUuid}`), "Anonymous voter · 3E1C4A7B");
assert.equal(congregationAdminVoterLabel("congregation-voter:legacy-user", "PresbyterDemo"), "PresbyterDemo");
assert.ok(!congregationAdminVoterLabel(userId, "Anonymous voter").includes(rawUuid), "Admin label must not expose the full temporary UUID");

const page = readFileSync("app/admin/preferences/page.tsx", "utf8");
assert.match(page, /congregationAdminVoterLabel\(item\.accountId, item\.nickname\)/);
assert.match(page, /congregationAdminVoterLabel\(voter\.userId, voter\.nickname\)/);
assert.match(page, /Delete nickname \$\{congregationAdminVoterLabel\(voter\.userId, voter\.nickname\)\}/);

console.log("Issue 437 temporary voter Admin label acceptance: PASS");
