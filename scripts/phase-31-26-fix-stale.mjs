import fs from "node:fs";

const path = "docs/architecture.md";
let text = fs.readFileSync(path, "utf8");

function replaceOnce(from, to) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Missing expected architecture text: ${from}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Architecture text is not unique: ${from}`);
  text = text.replace(from, to);
}

replaceOnce(
  "- Automatic conversion from final set to completed-service record is allowed by product direction but remains insufficiently specified for detailed architecture.",
  "- Automatic conversion from Final to Completed is resolved: a Final whose service date is strictly before the current `Europe/Prague` calendar date is converted at the next normal application reconciliation opportunity; service time is informational and does not affect eligibility.",
);

replaceOnce(
  "- How should final sets be converted to completed-service records automatically, if automatic conversion is implemented?\n",
  "",
);

fs.writeFileSync(path, text);
console.log("Phase 31.26 stale architecture statements resolved.");
