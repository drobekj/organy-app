import fs from "node:fs";

const path = "app/planning-lifecycle-client.tsx";
let source = fs.readFileSync(path, "utf8");
const importLine = 'import { NonRepetitionPeriodPanel } from "./non-repetition-period-panel";';

if (!source.includes(importLine)) {
  const anchor = 'import { ServiceContextReferenceTopicField } from "./service-context-reference-topic-field";';
  if (!source.includes(anchor)) throw new Error("Phase 31.24 import anchor not found.");
  source = source.replace(anchor, `${anchor}\n${importLine}`);
}

const oldBlock = `                <p className="field-help">Melody non-repetition is one shared configurable window: {interactionRepository.getMelodyWindow().months} calendar months before and after.</p>\n                {selectedRole === "admin" && <button type="button" onClick={() => interactionClient.setMelodyWindow({ actor: activeActor, months: 2 })}>Set demo 2-month window</button>}`;
const newBlock = `                <NonRepetitionPeriodPanel\n                  runtimeMode={runtimeMode}\n                  actor={activeActor}\n                  memoryInteractionRepository={interactionRepository}\n                  memoryPlanningSets={repositories.planningSets}\n                />`;

if (!source.includes(newBlock)) {
  const occurrences = source.split(oldBlock).length - 1;
  if (occurrences !== 1) throw new Error(`Expected exactly one Phase 31.24 Knowledge block anchor, found ${occurrences}.`);
  source = source.replace(oldBlock, newBlock);
}

if (!source.includes(importLine) || !source.includes(newBlock) || source.includes("Set demo 2-month window")) {
  throw new Error("Phase 31.24 UI transform postcondition failed.");
}

fs.writeFileSync(path, source);
