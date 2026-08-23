from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")

# Keep the direct in-memory repository contract aligned with the application candidate service.
replace_once(
    "src/application/interaction-contracts.ts",
    '''  queryCandidates(songs: CatalogSong[], input: CandidateQueryInput): CandidateQueryResult[] {\n    if (!input.organistPersonId) return [];\n    const languageSet = new Set(languagesForService(input.serviceLanguage));''',
    '''  queryCandidates(songs: CatalogSong[], input: CandidateQueryInput): CandidateQueryResult[] {\n    const organistPersonId = input.organistPersonId;\n    const languageSet = new Set(languagesForService(input.serviceLanguage));''',
)
replace_once(
    "src/application/interaction-contracts.ts",
    '''      if (!allClassSongIds.some((songId) => this.repertoire.has(this.repertoireKey(input.organistPersonId!, songId)))) continue;''',
    '''      if (organistPersonId && !allClassSongIds.some((songId) => this.repertoire.has(this.repertoireKey(organistPersonId, songId)))) continue;''',
)

# Final requires a concrete id everywhere; active catalog eligibility is enforced only when catalog enforcement is enabled.
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''      const person = await this.catalog.findPersonById(ref.id);\n      if (!isEligiblePerson(person, role)) issues.push({ path: role, message: `${role} is not active for the selected role.` });''',
    '''      if (!this.enforceCatalogSelections) continue;\n      const person = await this.catalog.findPersonById(ref.id);\n      if (!isEligiblePerson(person, role)) issues.push({ path: role, message: `${role} is not active for the selected role.` });''',
)

# The accepted no-history state is now explicit Anonymous rather than an empty person field.
replace_once(
    "scripts/lifecycle-regression-tests.ts",
    '''      assert.deepEqual(getDraftPeopleDefaults([]), { priest: { displayName: "" }, organist: { displayName: "" } });''',
    '''      assert.deepEqual(getDraftPeopleDefaults([]), { priest: { displayName: "Anonymous" }, organist: { displayName: "Anonymous" } });''',
)

# Record the accepted product-contract refinements rather than leaving requirements contradictory.
requirements = "docs/requirements.md"
replace_once(
    requirements,
    '''  - A final set is a saved final plan and is not directly editable.\n  - If a final set must change, it must be deleted and recreated.''',
    '''  - A final set is a saved final plan and is not directly editable.\n  - Admin may explicitly reopen a final set for editing; reopening changes it back to Working before any fields or rows become editable.\n  - Reopening is a lifecycle transition, not direct mutation of Final state.''',
)
replace_once(
    requirements,
    '''  - The hard filters are selected/default organist repertoire, service language, melody non-repetition rule, and preference threshold.''',
    '''  - With a concrete selected/default organist, the hard filters are that organist's repertoire, service language, melody non-repetition rule, and preference threshold.\n  - With `Anonymous` organist in a Working plan, only the repertoire filter is omitted; service language, melody non-repetition, preference threshold, and contextual signals remain in force.''',
)
replace_once(
    requirements,
    '''  - The system provides no direct edit final set action.''',
    '''  - The system provides no direct edit final set action; admin may explicitly reopen Final to Working and then edit it.''',
)
replace_once(
    requirements,
    '''- Priest and organist fields use lookup of active catalog persons with the matching role; typed search text alone is not a valid new selection.''',
    '''- Priest and organist fields use lookup of active catalog persons with the matching role; `Anonymous` is the explicit exception allowed while a set is Working. Typed free text alone is not a valid new selection. Finalization requires concrete active priest and organist selections.''',
)
replace_once(
    requirements,
    '''- Final sets are not directly edited; required changes happen by deleting and recreating the final set.''',
    '''- Final sets are not directly edited; admin may explicitly reopen Final to Working before changing it.''',
)

print("Issue 210 consistency patch applied")
