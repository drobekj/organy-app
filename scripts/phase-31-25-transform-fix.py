from pathlib import Path
import re

service_path = Path("src/application/planning-lifecycle/service.ts")
service = service_path.read_text(encoding="utf-8")
old = '    const outcome = await this.persistFinalSetCompletion(finalSet, this.now());'
new = '    const outcome = await this.persistFinalSetCompletion(finalSet as PersistedPlanningSet & { status: "final" }, this.now());'
if service.count(old) != 1:
    raise SystemExit(f"manual completion narrowing anchor count={service.count(old)}")
service = service.replace(old, new, 1)
old = '      .filter((set) => set.status === "final" && isPastPragueDate(set.serviceContext.serviceDate, now))'
new = '      .filter((set): set is PersistedPlanningSet & { status: "final" } => set.status === "final" && isPastPragueDate(set.serviceContext.serviceDate, now))'
if service.count(old) != 1:
    raise SystemExit(f"automatic completion narrowing anchor count={service.count(old)}")
service = service.replace(old, new, 1)
service_path.write_text(service, encoding="utf-8", newline="\n")

test_path = Path("scripts/phase-31-25-tests.ts")
tests = test_path.read_text(encoding="utf-8")
tests, count = re.subn(r'throw new Error\(([A-Za-z0-9_]+)\.error\.message\);', 'throw new Error("Unexpected Planning Lifecycle failure.");', tests)
if count < 4:
    raise SystemExit(f"expected at least 4 impossible-branch test guards, found {count}")
test_path.write_text(tests, encoding="utf-8", newline="\n")

print("Phase 31.25 type-narrowing fixes applied")
