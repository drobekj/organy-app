import fs from "node:fs";

const path = "docs/implementation-preparation.md";
let text = fs.readFileSync(path, "utf8");
const replacements = [
  [
    "- **Authorization design follows the logical auth/account/role model.** Future account modeling, actor identification, role assignments, and permission checks must use `docs/auth-account-role-model.md` as input while authentication approach remains unresolved.",
    "- **Authorization design follows the accepted production auth/account/role model.** Production authentication resolves through Better Auth Account/session identity to an active `app_user` Actor, while current church-domain permissions remain authoritative in `app_user_roles` according to Phase 31.27."
  ],
  [
    "- Automatic final-set completion details remain unresolved and could block a complete lifecycle slice.",
    "- Production readiness still depends on later operational concerns such as authentication implementation, deployment, backup/restore, and broader production test strategy."
  ]
];
for (const [from, to] of replacements) {
  if (!text.includes(from)) throw new Error(`Expected stale text not found: ${from}`);
  text = text.replace(from, to);
}
fs.writeFileSync(path, text);
console.log("Phase 31.27 final stale-text fixup applied.");
