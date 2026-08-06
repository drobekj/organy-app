from pathlib import Path


def replace_once(path: str, before: str, after: str, label: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one anchor for {label}, found {count}")
    file.write_text(source.replace(before, after, 1), encoding="utf-8")


replace_once(
    "src/planning-lifecycle/candidate-flow.ts",
    '    case "lookupChanged":\n      return { ...row, songSearch: action.text, lookupOpen: Boolean(action.text.trim()) };',
    '    case "lookupChanged":\n      return { ...row, songSearch: action.text, lookupOpen: true };',
    "empty browse remains open",
)

replace_once(
    "app/planning-lifecycle-client.tsx",
    ", refreshOpenSongLookupsOnContextChange",
    "",
    "unused legacy refresh import",
)

replace_once(
    "app/planning-lifecycle-client.tsx",
    '''    if (currentRow?.selectedSong?.songId === candidate.songId) {
      setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "candidateSelected", song: candidateToSelectedSong(candidate), candidate }) : row));
    } else {
      guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "candidateSelected", song: candidateToSelectedSong(candidate), candidate }) : row)));
    }
''',
    '''    if (currentRow?.selectedSong?.songId === candidate.songId) {
      setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    } else {
      guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "candidateSelected", song: candidateToSelectedSong(candidate), candidate }) : row)));
    }
''',
    "idempotent exact-song reselection",
)

replace_once(
    "src/planning-lifecycle/candidate-list.tsx",
    '''  const unavailableCurrent = Boolean(props.open && !props.loading && !props.error && props.selectedSong && currentCandidateIndex < 0);''',
    '''  const unavailableCurrent = Boolean(props.open && !props.loading && !props.error && !props.value.trim() && props.selectedSong && currentCandidateIndex < 0);''',
    "hard-filter unavailable context only in browse mode",
)

replace_once(
    "scripts/phase-31-16-tests.tsx",
    '''  assert.equal(opened[1].lookupOpen, true);
  assert.equal(opened[1].songSearch, "", "browse mode must not query the confirmed display label");

  const replaced = planningCandidateRowReducer(rows[0], {
''',
    '''  assert.equal(opened[1].lookupOpen, true);
  assert.equal(opened[1].songSearch, "", "browse mode must not query the confirmed display label");
  const typedThenCleared = planningCandidateRowReducer(
    planningCandidateRowReducer(opened[1], { type: "lookupChanged", text: "421" }),
    { type: "lookupChanged", text: "" },
  );
  assert.equal(typedThenCleared.lookupOpen, true, "clearing a live query must return to open browse mode");
  const switchedAfterClear = openSingleCandidateRow([opened[0], typedThenCleared], 1);
  assert.equal(switchedAfterClear[1].songSearch, "czech 421 — Equivalent", "switching after a cleared query must restore the confirmed label");

  const replaced = planningCandidateRowReducer(rows[0], {
''',
    "cleared-query regression",
)

replace_once(
    "scripts/phase-31-16-tests.tsx",
    '''  const unavailableHtml = renderToStaticMarkup(
    <CandidateCombobox
      {...common}
      selectedSong={{ songId: "polish:999", language: "polish", number: "999", title: "Retained invalid" }}
      candidates={[available]}
      serviceLanguage="czech"
    />,
  );
  assert.match(unavailableHtml, /Currently selected/);
  assert.match(unavailableHtml, /polish song in a czech service/i);
''',
    '''  const unavailableHtml = renderToStaticMarkup(
    <CandidateCombobox
      {...common}
      selectedSong={{ songId: "polish:999", language: "polish", number: "999", title: "Retained invalid" }}
      candidates={[available]}
      serviceLanguage="czech"
    />,
  );
  assert.match(unavailableHtml, /Currently selected/);
  assert.match(unavailableHtml, /polish song in a czech service/i);
  const searchedHtml = renderToStaticMarkup(
    <CandidateCombobox
      {...common}
      value="different search"
      selectedSong={{ songId: "polish:999", language: "polish", number: "999", title: "Retained invalid" }}
      candidates={[available]}
      serviceLanguage="czech"
    />,
  );
  assert.doesNotMatch(searchedHtml, /Not available because/, "search mismatch must not be presented as a hard-filter failure");
''',
    "browse-only unavailable regression",
)

Path(__file__).unlink(missing_ok=True)
print("Phase 31.16 review corrections applied.")
