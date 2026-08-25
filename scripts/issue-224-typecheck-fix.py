from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    file.write_text(text.replace(old, new, 1))

replace_once(
    "app/planning-lifecycle-client.tsx",
    'PlanningSet, ServiceAntiphonReference, ServiceLanguage, ServiceTopicReference',
    'PlanningSet, ServiceAntiphonReference, ServiceContext, ServiceLanguage, ServiceTopicReference',
    "client ServiceContext import",
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '  isPastPragueDate,\n  type PlanningLifecycleDrizzleAdapterDependencies,',
    '  isPastPragueDate,\n  type PersistedPlanningSet,\n  type PlanningLifecycleDrizzleAdapterDependencies,',
    "route PersistedPlanningSet import",
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '          plans: result.value,',
    '          plans: result.value as PersistedPlanningSet[],',
    "route listPlanningSets narrowing",
)
replace_once(
    "scripts/issue-224-tests.ts",
    'assert.match(cssSource, /\\.needs-revision-row\\s*\\{[^}]*border:\\s*2px solid var\\(--danger\\)/s);',
    'assert.match(cssSource, /\\.needs-revision-row\\s*\\{[\\s\\S]*?border:\\s*2px solid var\\(--danger\\)/);',
    "needs revision regex target",
)
replace_once(
    "scripts/issue-224-tests.ts",
    'assert.match(cssSource, /\\.history-scroll-list\\s*\\{[^}]*overflow-y:\\s*auto/s);',
    'assert.match(cssSource, /\\.history-scroll-list\\s*\\{[\\s\\S]*?overflow-y:\\s*auto/);',
    "history regex target",
)
