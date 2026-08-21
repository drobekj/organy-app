from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one guarded match, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/planning-lifecycle/candidate-list.tsx",
    'import type { CandidateQueryResult } from "../application/interaction-contracts";\nimport type { ConcreteSongLanguage, ServiceLanguage } from "./model";',
    'import type { CandidateQueryResult } from "../application/interaction-contracts";\nimport { getCandidateLineViewModel } from "./candidate-line";\nimport type { ConcreteSongLanguage, ServiceLanguage } from "./model";',
)
replace_once(
    "src/planning-lifecycle/candidate-list.tsx",
    '            const current = Boolean(currentSongId && candidate.songId === currentSongId);\n            const selectable = isCandidateSelectable(candidate);\n            return (',
    '            const current = Boolean(currentSongId && candidate.songId === currentSongId);\n            const selectable = isCandidateSelectable(candidate);\n            const viewModel = getCandidateLineViewModel(candidate);\n            return (',
)
replace_once(
    "src/planning-lifecycle/candidate-list.tsx",
    '                className={`candidate-option-row${current ? " candidate-option-current" : ""}${index === activeIndex && !current ? " candidate-option-active" : ""}`}',
    '                className={`candidate-option-row ${viewModel.backgroundClass}${current ? " candidate-option-current" : ""}${index === activeIndex && !current ? " candidate-option-active" : ""}`}',
)
replace_once(
    "src/planning-lifecycle/candidate-list.tsx",
    '                  aria-selected={current}\n                  aria-disabled={!selectable}',
    '                  aria-selected={current}\n                  aria-disabled={!selectable}\n                  aria-label={viewModel.accessibleMeaning}',
)
replace_once(
    "src/planning-lifecycle/candidate-list.tsx",
    '                    <span className="candidate-option-main" style={{ alignItems: "center", minHeight: "2rem" }}>',
    '                    <span className={`candidate-option-main ${viewModel.contentTextClass}`} style={{ alignItems: "center", minHeight: "2rem" }}>',
)

replace_once(
    "src/planning-lifecycle/melody-detail.tsx",
    'import type { CandidateMelodyMember, CandidateQueryResult } from "../application/interaction-contracts";\nimport type { ServiceLanguage } from "./model";',
    'import type { CandidateMelodyMember, CandidateQueryResult } from "../application/interaction-contracts";\nimport { getCandidateLineViewModel } from "./candidate-line";\nimport type { ServiceLanguage } from "./model";',
)
replace_once(
    "src/planning-lifecycle/melody-detail.tsx",
    '          const eligibility = eligibilityBySongId.get(member.songId);\n          const languageAllowed = isMemberLanguageAllowed(member.language, props.serviceLanguage);',
    '          const eligibility = eligibilityBySongId.get(member.songId);\n          const viewModel = eligibility ? getCandidateLineViewModel(eligibility) : undefined;\n          const languageAllowed = isMemberLanguageAllowed(member.language, props.serviceLanguage);',
)
replace_once(
    "src/planning-lifecycle/melody-detail.tsx",
    '              className={`melody-member${isOpened ? " melody-member-opened" : ""}${isCurrent ? " melody-member-current" : ""}${rowActivatable ? " melody-member-activatable" : " melody-member-unavailable"}${activeIndex === index && rowActivatable ? " melody-member-active" : ""}`}',
    '              className={`melody-member${viewModel ? ` ${viewModel.backgroundClass}` : ""}${isOpened ? " melody-member-opened" : ""}${isCurrent ? " melody-member-current" : ""}${rowActivatable ? " melody-member-activatable" : " melody-member-unavailable"}${activeIndex === index && rowActivatable ? " melody-member-active" : ""}`}',
)
replace_once(
    "src/planning-lifecycle/melody-detail.tsx",
    '                  <span className="candidate-option-main" style={{ alignItems: "center", minHeight: "2rem", opacity: infoOpacity }}><strong>{member.number}</strong><span>{member.title}</span></span>',
    '                  <span className={`candidate-option-main${viewModel ? ` ${viewModel.contentTextClass}` : ""}`} style={{ alignItems: "center", minHeight: "2rem", opacity: infoOpacity }}><strong>{member.number}</strong><span>{member.title}</span></span>',
)
replace_once(
    "src/planning-lifecycle/melody-detail.tsx",
    '                      {eligibility && <span style={{ opacity: infoOpacity }}>Signal {eligibility.signal}</span>}',
    '                      {eligibility && <span className={viewModel?.contentTextClass} style={{ opacity: infoOpacity }}>Signal {eligibility.signal}</span>}',
)

replace_once(
    "scripts/phase-31-16-tests.tsx",
    '  const html = renderToStaticMarkup(<CandidateCombobox {...common} />);',
    '''  const season = candidate("czech:1", "1", "Season candidate", { seasonMatch: true, signal: "season" });
  const antiphon = candidate("czech:2", "2", "Antiphon candidate", { antiphonMatch: true, signal: "antiphon" });
  const html = renderToStaticMarkup(<CandidateCombobox {...common} />);''',
)
replace_once(
    "scripts/phase-31-16-tests.tsx",
    '  assert.match(html, /candidate-option-current/, "the exact selected song keeps its visual current-row highlight");',
    '''  assert.match(html, /candidate-option-current/, "the exact selected song keeps its visual current-row highlight");
  const seasonHtml = renderToStaticMarkup(<CandidateCombobox {...common} value="" selectedSong={undefined} candidates={[season]} />);
  assert.match(seasonHtml, /candidate-option-row candidate-tone-positive candidate-preference-none/, "compact season candidate must keep the established positive tone class");
  assert.match(seasonHtml, /candidate-option-main candidate-content-text candidate-text-positive/, "compact season candidate text must render green");
  const antiphonHtml = renderToStaticMarkup(<CandidateCombobox {...common} value="" selectedSong={undefined} candidates={[antiphon]} />);
  assert.match(antiphonHtml, /candidate-option-row candidate-tone-negative candidate-preference-none/, "compact antiphon candidate must keep the established negative tone class");
  assert.match(antiphonHtml, /candidate-option-main candidate-content-text candidate-text-negative/, "compact antiphon candidate text must render red");''',
)

replace_once(
    "scripts/phase-31-17-tests.tsx",
    'assert.match(candidateDetail, /melody-member-meta[\\s\\S]*?>Score<\\/a>[\\s\\S]*?melody-member-actions/, "available Score occupies the same metadata area as Score not available");',
    '''assert.match(candidateDetail, /melody-member-meta[\\s\\S]*?>Score<\\/a>[\\s\\S]*?melody-member-actions/, "available Score occupies the same metadata area as Score not available");

const seasonDetail = renderToStaticMarkup(
  <MelodyClassDetail
    mode="candidate"
    rowLabel="Row 1"
    candidate={{ ...available, seasonMatch: true, signal: "season", preferenceShade: "none" }}
    serviceLanguage="czech"
    eligibilityCandidates={[{ ...available, seasonMatch: true, signal: "season", preferenceShade: "none" }]}
    loading={false}
    onBack={() => undefined}
    onClose={() => undefined}
    onRetry={() => undefined}
    onReturnToCandidates={() => undefined}
  />,
);
assert.match(seasonDetail, /melody-member candidate-tone-positive candidate-preference-none/, "opened season detail must retain the positive tone class");
assert.match(seasonDetail, /candidate-text-positive/, "opened season detail must render the season signal green");
assert.match(seasonDetail, /Signal season/);

const antiphonDetail = renderToStaticMarkup(
  <MelodyClassDetail
    mode="candidate"
    rowLabel="Row 1"
    candidate={{ ...available, antiphonMatch: true, signal: "antiphon", preferenceShade: "none" }}
    serviceLanguage="czech"
    eligibilityCandidates={[{ ...available, antiphonMatch: true, signal: "antiphon", preferenceShade: "none" }]}
    loading={false}
    onBack={() => undefined}
    onClose={() => undefined}
    onRetry={() => undefined}
    onReturnToCandidates={() => undefined}
  />,
);
assert.match(antiphonDetail, /melody-member candidate-tone-negative candidate-preference-none/, "opened antiphon detail must retain the negative tone class");
assert.match(antiphonDetail, /candidate-text-negative/, "opened antiphon detail must render the antiphon signal red");''',
)
