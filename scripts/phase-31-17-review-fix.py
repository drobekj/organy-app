from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one anchor, found {count}: {old[:100]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')

# Persist the superseding Planning detail proof, rather than only applying it inside bootstrap.
replace_once(
    'scripts/planning-ui-workflow-static-tests.ts',
    '  "onOpenDetail={() => row.selectedSong?.songId && openCatalogSongDetail(row.selectedSong.songId, row.id)}",',
    '  "onOpenDetail={() => openSelectedSongDetail(row.id, row.selectedCandidate ?? candidateFromSelectedSong(row.selectedSong!))}",',
)

# Make the in-memory/demo boundary obey the already-authoritative concrete-song result contract.
service_path = Path('src/application/interaction-service.ts')
service = service_path.read_text(encoding='utf-8')
start = service.index('export function queryCandidatesFromData(')
end = service.index('function buildMemoryMelodyMembers', start)
new_query = r'''export function queryCandidatesFromData(songs: CatalogSong[], preferences: SongPreference[], repertoire: Set<string>, knowledge: { antiphons: KnowledgeMapping[]; seasons: KnowledgeMapping[]; melodyClasses: MelodyClass[]; melodyWindow?: MelodyNonRepetitionConfig }, input: CandidateQueryInput): CandidateQueryResult[] {
  if (!input.organistPersonId) return [];
  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));
  const window = knowledge.melodyWindow ?? { months: 2 };
  const recentClassIds = getRecentMelodyClassIds(knowledge.melodyClasses, input, window);
  const queryText = input.queryText?.trim().toLocaleLowerCase() ?? "";
  const threshold = input.preferenceThreshold ?? 0;
  const songsById = new Map(songs.map((song) => [song.songId, song]));
  const candidates: CandidateQueryResult[] = [];

  for (const song of songs) {
    if (!song.active || !languageSet.has(song.language)) continue;
    const melody = knowledge.melodyClasses.find((item) => item.songIds.includes(song.songId));
    const classId = melody?.id ?? `song:${song.songId}`;
    if (melody && recentClassIds.has(melody.id)) continue;
    const allClassSongIds = melody?.songIds ?? [song.songId];
    if (!allClassSongIds.some((songId) => repertoire.has(songId))) continue;

    const aggregatePreferenceScore = preferences.filter((preference) => preference.songId === song.songId).reduce((sum, preference) => sum + preference.score, 0);
    if (aggregatePreferenceScore < threshold) continue;
    if (queryText && !song.number.toLocaleLowerCase().includes(queryText) && !song.title.toLocaleLowerCase().includes(queryText)) continue;

    const antiphonMatch = Boolean(input.antiphonKey && knowledge.antiphons.some((mapping) => mapping.key === input.antiphonKey && mapping.songId === song.songId));
    const seasonMatch = Boolean(input.liturgicalSeasonKey && knowledge.seasons.some((mapping) => mapping.key === input.liturgicalSeasonKey && mapping.songId === song.songId));
    const signal = getCandidateSignal({ antiphonMatch, seasonMatch });
    const melodyMembers = buildMemoryMelodyMembers(song, allClassSongIds, songsById, preferences, repertoire);
    const equivalentNumbers = melodyMembers
      .filter((member) => member.songId !== song.songId)
      .map((member) => ({ songId: member.songId, number: member.number, repertoire: member.repertoire }));

    candidates.push({
      songId: song.songId,
      language: song.language,
      number: song.number,
      title: song.title,
      equivalentNumbers,
      melodyClassId: classId,
      melodyMembers,
      aggregatePreferenceScore,
      antiphonMatch,
      seasonMatch,
      signal,
      preferenceShade: getPreferenceShade(aggregatePreferenceScore),
      repertoire: repertoire.has(song.songId),
      availability: availabilityForClass(knowledge.melodyClasses, classId, input.candidateUsages ?? []),
      suppressedByMelodyWindow: false,
      ...(song.sheetMusicUrl ? { sheetMusicUrl: song.sheetMusicUrl } : {}),
      orderKey: memoryConcreteOrderKey(song),
    });
  }
  return candidates.sort((left, right) => left.orderKey.localeCompare(right.orderKey));
}

function memoryConcreteOrderKey(song: CatalogSong): string {
  const match = song.number.match(/^(\d+)(?:\/(\d+))?$/);
  const numberKey = match
    ? `${String(Number(match[1])).padStart(8, "0")}:${String(Number(match[2] ?? 0)).padStart(3, "0")}`
    : song.number;
  return `${song.language === "czech" ? 0 : 1}:${numberKey}:${song.songId}`;
}
'''
service_path.write_text(service[:start] + new_query + service[end:], encoding='utf-8')

# Refresh or cancel detail eligibility whenever its owning context changes.
client = 'app/planning-lifecycle-client.tsx'
replace_once(
    client,
    '''    if (recordChanged) {
      setPlanningExpansion(null);
      setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
      return;
    }
    if (openCandidateRowId !== null) {
      const openRow = rows.find((row) => row.id === openCandidateRowId);
      if (openRow) void queryCandidateResults(openRow.id, openRow.songSearch);
    }''',
    '''    if (recordChanged) {
      detailEligibilityRequest.current += 1;
      setDetailEligibilityCandidates([]);
      setDetailEligibilityLoading(false);
      setDetailEligibilityError(undefined);
      setPlanningExpansion(null);
      setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
      return;
    }
    if (openCandidateRowId !== null) {
      const openRow = rows.find((row) => row.id === openCandidateRowId);
      if (openRow) void queryCandidateResults(openRow.id, openRow.songSearch);
    } else if (planningExpansion && planningExpansion.kind !== "candidateList") {
      void loadDetailEligibility(planningExpansion.rowId);
    }''',
)
replace_once(
    client,
    '''      setDetailEligibilityCandidates(candidates);
      setDetailEligibilityLoading(false);''',
    '''      setDetailEligibilityCandidates(candidates);
      setPlanningExpansion((current) => {
        if (!current || current.kind === "candidateList" || current.rowId !== rowId) return current;
        const refreshedCandidate = candidates.find((candidate) => candidate.songId === current.songId);
        return refreshedCandidate ? { ...current, candidate: refreshedCandidate } : current;
      });
      setDetailEligibilityLoading(false);''',
)
replace_once(
    client,
    '''  function openCandidateList(rowId: number) {
    if (!canEditRows || (planningExpansion?.kind === "candidateList" && planningExpansion.rowId === rowId)) return;
    lookupTracker.invalidatePrefix("song:");''',
    '''  function openCandidateList(rowId: number) {
    if (!canEditRows || (planningExpansion?.kind === "candidateList" && planningExpansion.rowId === rowId)) return;
    resetDetailEligibility();
    lookupTracker.invalidatePrefix("song:");''',
)
replace_once(
    client,
    '''  function clearSong(rowId: number) {
    lookupTracker.invalidatePrefix("song:");''',
    '''  function clearSong(rowId: number) {
    resetDetailEligibility();
    lookupTracker.invalidatePrefix("song:");''',
)
replace_once(
    client,
    '''    if (planningExpansion?.rowId === id) setPlanningExpansion(null);
    else if (openCandidateRowId !== null) setCandidateRefreshGeneration((generation) => generation + 1);''',
    '''    if (planningExpansion?.rowId === id) {
      setPlanningExpansion(null);
      resetDetailEligibility();
    } else if (planningExpansion !== null) setCandidateRefreshGeneration((generation) => generation + 1);''',
)
replace_once(
    client,
    '''    if (openCandidateRowId !== null) setCandidateRefreshGeneration((generation) => generation + 1);
    setSaveState("unsaved");''',
    '''    if (planningExpansion !== null) setCandidateRefreshGeneration((generation) => generation + 1);
    setSaveState("unsaved");''',
)
replace_once(
    client,
    '''      lookupTracker.invalidatePrefix("song:");
      setPlanningExpansion(null);
      setCandidateResults({});''',
    '''      lookupTracker.invalidatePrefix("song:");
      setPlanningExpansion(null);
      resetDetailEligibility();
      setCandidateResults({});''',
)

# Distinguish actual equivalent repertoire evidence from a class with no repertoire evidence.
detail_path = Path('src/planning-lifecycle/melody-detail.tsx')
detail = detail_path.read_text(encoding='utf-8')
detail = detail.replace(
    '  const { authoritative, members } = useMemo(() => melodyMembersForDetail(props.candidate), [props.candidate]);',
    '  const { authoritative, members } = useMemo(() => melodyMembersForDetail(props.candidate), [props.candidate]);\n  const classHasRepertoire = members.some((member) => member.repertoire);',
    1,
)
detail = detail.replace(
    '{props.loading && <p className="candidate-list-state" role="status">Checking available replacements…</p>}',
    '{props.loading && <p className="candidate-list-state" role="status">{props.mode === "selected" ? "Checking available replacements…" : "Checking candidate availability…"}</p>}',
    1,
)
detail = detail.replace(
    '<span>{member.repertoire ? "In repertoire" : "Melody known through an equivalent"}</span>',
    '<span>{member.repertoire ? "In repertoire" : classHasRepertoire ? "Melody known through an equivalent" : "Not in repertoire"}</span>',
    1,
)
detail_path.write_text(detail, encoding='utf-8')

# Strengthen focused evidence for concrete memory candidates and refreshed detail context.
test_path = Path('scripts/phase-31-17-tests.tsx')
test = test_path.read_text(encoding='utf-8')
test = test.replace(
    'assert.equal(memoryCandidates[0]?.melodyClassId, "demo-class");',
    'assert.deepEqual(memoryCandidates.map((candidate) => candidate.songId), ["demo-cz", "demo-pl"]);\nassert.equal(memoryCandidates[0]?.melodyClassId, "demo-class");',
    1,
)
test = test.replace(
    'assert.match(clientSource, /replaceFromSelectedDetail/);',
    'assert.match(clientSource, /replaceFromSelectedDetail/);\nassert.equal(clientSource.includes(\'else if (planningExpansion && planningExpansion.kind !== "candidateList")\'), true);\nassert.equal(clientSource.includes("resetDetailEligibility();\\n      setCandidateResults"), true);',
    1,
)
test_path.write_text(test, encoding='utf-8')

print('Phase 31.17 review corrections applied.')
