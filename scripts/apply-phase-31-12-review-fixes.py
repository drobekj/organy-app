from pathlib import Path

service = Path("src/application/reference-candidate-service.ts")
text = service.read_text()
old = '''    return {
      ...toCandidate(stored, equivalents, antiphonMatch, false),
      orderKey: `hydrated:${stored.language}:${String(stored.canonicalNumber).padStart(8, "0")}:${stored.id}`,
    };'''
new = '''    return {
      ...toCandidate(stored, equivalents, antiphonMatch, false),
      number: reference.number,
      title: reference.title ?? stored.title,
      orderKey: `hydrated:${stored.language}:${String(stored.canonicalNumber).padStart(8, "0")}:${stored.id}`,
    };'''
if old not in text:
    raise SystemExit("hydration return block not found")
service.write_text(text.replace(old, new, 1))

client = Path("app/planning-lifecycle-client.tsx")
text = client.read_text()
old = 'useEffect(() => { lookupTracker.invalidatePrefix("song:"); setCandidateResults({}); }, [runtimeMode, serviceContextRecordKey, organistId, referenceAntiphon?.id, serviceLanguage, lookupTracker]);'
new = 'useEffect(() => { lookupTracker.invalidatePrefix("song:"); setCandidateResults({}); }, [runtimeMode, serviceContextRecordKey, organistId, referenceAntiphon?.id, serviceLanguage, serviceDate, lookupTracker]);'
if old not in text:
    raise SystemExit("candidate invalidation effect not found")
text = text.replace(old, new, 1)
old = 'const requestIdentity = [runtimeMode, serviceContextRecordKey, languageAtRequest, organistId ?? "", referenceAntiphon?.id ?? "", value].join("|");'
new = 'const requestIdentity = [runtimeMode, serviceContextRecordKey, serviceDate, languageAtRequest, organistId ?? "", referenceAntiphon?.id ?? "", value].join("|");'
if old not in text:
    raise SystemExit("candidate request identity not found")
client.write_text(text.replace(old, new, 1))

route = Path("app/api/interaction/route.ts")
text = route.read_text()
old = 'typeof input.serviceDate !== "string" || !ISO_DATE.test(input.serviceDate) || !Number.isFinite(Date.parse(`${input.serviceDate}T00:00:00Z`))'
if old not in text:
    raise SystemExit("query date validation not found")
text = text.replace(old, 'typeof input.serviceDate !== "string" || !isValidIsoDate(input.serviceDate)', 1)
old = 'typeof usage.serviceDate !== "string" || !ISO_DATE.test(usage.serviceDate)'
if old not in text:
    raise SystemExit("usage date validation not found")
text = text.replace(old, 'typeof usage.serviceDate !== "string" || !isValidIsoDate(usage.serviceDate)', 1)
marker = 'function validateOptionalString(input: Record<string, unknown>, key: string): void {'
if marker not in text:
    raise SystemExit("route helper insertion marker not found")
helper = '''function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

'''
route.write_text(text.replace(marker, helper + marker, 1))

unit = Path("scripts/phase-31-12-tests.tsx")
text = unit.read_text()
old = 'assert.equal(hydrated[0].title, "Authoritative Alpha");\n  assert.equal(hydrated[0].number, "1");'
if old not in text:
    raise SystemExit("unit hydration assertions not found")
unit.write_text(text.replace(old, 'assert.equal(hydrated[0].title, "Historical title");\n  assert.equal(hydrated[0].number, "OLD");', 1))

verify = Path("scripts/verify-phase-31-12.ts")
text = verify.read_text()
old = 'assert.equal(hydrated.body.value[0].title, "Phase 31.12 Authoritative Candidate");\n  assert.equal(hydrated.body.value[0].signal, "antiphon");'
if old not in text:
    raise SystemExit("DB hydration assertions not found")
text = text.replace(old, 'assert.equal(hydrated.body.value[0].title, "Historical");\n  assert.equal(hydrated.body.value[0].number, "OLD");\n  assert.equal(hydrated.body.value[0].aggregatePreferenceScore, 3);\n  assert.equal(hydrated.body.value[0].signal, "antiphon");', 1)
old = '{ ...baseQuery(), serviceLanguage: "english" },'
if old not in text:
    raise SystemExit("strict route assertion marker not found")
verify.write_text(text.replace(old, old + '\n    { ...baseQuery(), serviceDate: "2026-02-31" },', 1))

Path(".github/workflows/phase-31-12-review-fixes.yml").unlink(missing_ok=True)

ci = Path(".github/workflows/ci.yml")
text = ci.read_text()
text = text.replace("\npermissions:\n  contents: write\n", "\n", 1)
start_marker = "      # BEGIN TEMP PHASE 31.12 REVIEW FIX\n"
end_marker = "      # END TEMP PHASE 31.12 REVIEW FIX\n"
start = text.find(start_marker)
end = text.find(end_marker)
if start < 0 or end < 0:
    raise SystemExit("temporary CI block markers not found")
end += len(end_marker)
ci.write_text(text[:start] + text[end:])
