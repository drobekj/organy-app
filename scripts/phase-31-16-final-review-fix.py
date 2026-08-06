from pathlib import Path


def replace_once(path: str, before: str, after: str, label: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one anchor for {label}, found {count}")
    file.write_text(source.replace(before, after, 1), encoding="utf-8")


replace_once(
    "app/planning-lifecycle-client.tsx",
    '''                <fieldset className="row-card" key={row.id} onFocus={() => activateExistingRow(row.id)} onKeyDown={(event) => { if (event.key === "Escape") cancelActiveLookup(row.id); }}>
''',
    '''                <fieldset className="row-card" key={row.id} onFocus={() => { if (openCandidateRowId === null || openCandidateRowId === row.id) activateExistingRow(row.id); }} onKeyDown={(event) => { if (event.key === "Escape") cancelActiveLookup(row.id); }}>
''',
    "explicit-list focus ownership",
)

replace_once(
    "src/planning-lifecycle/candidate-list.tsx",
    '''                data-song-id={candidate.songId}
              >
                <button type="button" disabled={!selectable} onClick={() => { if (selectable) props.onSelect(candidate); }}>
                  <span className="candidate-option-main"><strong>{candidate.number}</strong><span>{candidate.title}</span><span>{candidate.language}</span></span>
                  <span className="candidate-option-meta">{candidate.repertoire ? "In repertoire" : "Melody known through an equivalent"} · preference {candidate.aggregatePreferenceScore} · {candidate.signal}</span>
                  {candidate.melodyMembers && candidate.melodyMembers.length > 1 && <span className="candidate-option-meta">Melody class: {candidate.melodyMembers.length} songs</span>}
                  {current && <span className="candidate-current-marker">Currently selected</span>}
                  {reason && <span className="candidate-unavailable-reason">Unavailable — {reason}</span>}
                </button>
              </div>
''',
    '''                data-song-id={candidate.songId}
                onClick={() => { if (selectable) props.onSelect(candidate); }}
              >
                <div className="candidate-option-content">
                  <span className="candidate-option-main"><strong>{candidate.number}</strong><span>{candidate.title}</span><span>{candidate.language}</span></span>
                  <span className="candidate-option-meta">{candidate.repertoire ? "In repertoire" : "Melody known through an equivalent"} · preference {candidate.aggregatePreferenceScore} · {candidate.signal}</span>
                  {candidate.melodyMembers && candidate.melodyMembers.length > 1 && <span className="candidate-option-meta">Melody class: {candidate.melodyMembers.length} songs</span>}
                  {current && <span className="candidate-current-marker">Currently selected</span>}
                  {reason && <span className="candidate-unavailable-reason">Unavailable — {reason}</span>}
                </div>
              </div>
''',
    "semantic listbox option",
)

for before, after, label in [
    (".candidate-option > button {", ".candidate-option-content {", "option content selector"),
    (".candidate-option-active > button {", ".candidate-option-active .candidate-option-content {", "active option selector"),
    (".candidate-option-current > button {", ".candidate-option-current .candidate-option-content {", "current option selector"),
    (".candidate-option-disabled > button {", ".candidate-option-disabled .candidate-option-content {", "disabled option selector"),
]:
    replace_once("app/globals.css", before, after, label)

replace_once(
    "scripts/phase-31-16-tests.tsx",
    '''  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /Row 2 and Row 3/);
''',
    '''  assert.match(html, /aria-disabled="true"/);
  assert.doesNotMatch(html, /<button[^>]*disabled/, "disabled candidates remain semantic options rather than nested disabled controls");
  assert.match(html, /Row 2 and Row 3/);
''',
    "semantic option regression",
)

replace_once(
    "scripts/phase-31-16-tests.tsx",
    '''  assert.match(client, /openCandidateRowId/);
  assert.match(client, /CandidateCombobox/);
''',
    '''  assert.match(client, /openCandidateRowId/);
  assert.match(client, /openCandidateRowId === null \|\| openCandidateRowId === row\.id/, "unrelated row focus must not detach the open list from its query state");
  assert.match(client, /CandidateCombobox/);
''',
    "focus ownership regression",
)

Path(__file__).unlink(missing_ok=True)
print("Phase 31.16 final review corrections applied.")
