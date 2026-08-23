from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")

page = "app/admin/accounts/page.tsx"
replace_once(
    page,
    'import { ProtectedAccountEditor } from "./protected-account-editor";',
    'import { ProtectedAccountEditor } from "./protected-account-editor";\nimport { ProtectedStaffOnboardingForm } from "./protected-staff-onboarding-form";',
)
replace_once(
    page,
    '''  const snapshot = await new PostgresProtectedAccountAdminService(authPool).list(requestHeaders);\n  const params = await searchParams;''',
    '''  const snapshot = await new PostgresProtectedAccountAdminService(authPool).list(requestHeaders);\n  const peopleResult = await authPool.query(`\n    select p.id, p.display_name, p.priest, p.organist\n    from catalog_persons p\n    where p.active = true and (p.priest = true or p.organist = true)\n    order by lower(p.display_name)\n  `);\n  const staffPeople = peopleResult.rows.map((row) => ({ id: String(row.id), displayName: String(row.display_name), priest: Boolean(row.priest), organist: Boolean(row.organist) }));\n  const params = await searchParams;''',
)
replace_once(
    page,
    '''    <p className="field-help">Protected staff use username + password. Church-domain roles remain authoritative only in app_user_roles.</p>''',
    '''    <p className="field-help">Protected staff use username + password. Church-domain roles remain authoritative only in app_user_roles.</p>\n    <section className="detail-panel" aria-label="Add staff account"><h2>Add priest / organist account</h2><ProtectedStaffOnboardingForm people={staffPeople} /></section>''',
)

package = "package.json"
replace_once(
    package,
    '''    "test:phase-31-28": "tsx scripts/phase-31-28-tests.ts"''',
    '''    "test:phase-31-28": "tsx scripts/phase-31-28-tests.ts",\n    "test:product-refinement-210": "tsx scripts/product-refinement-210-tests.ts"''',
)

print("Issue 210 onboarding/page patch applied")
