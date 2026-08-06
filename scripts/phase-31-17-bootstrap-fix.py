from pathlib import Path

path = Path('scripts/phase-31-17-tests.tsx')
text = path.read_text(encoding='utf-8')
text = text.replace('import { readFile } from "node:fs/promises";', 'import { readFileSync } from "node:fs";')
text = text.replace('const clientSource = await readFile("app/planning-lifecycle-client.tsx", "utf8");', 'const clientSource = readFileSync("app/planning-lifecycle-client.tsx", "utf8");')
path.write_text(text, encoding='utf-8')

path = Path('src/planning-lifecycle/candidate-list.tsx')
text = path.read_text(encoding='utf-8')
text = text.replace('  onOpenDetail: (candidate: CandidateQueryResult) => void;', '  onOpenDetail?: (candidate: CandidateQueryResult) => void;')
text = text.replace('  onBackFromDetail: () => void;', '  onBackFromDetail?: () => void;')
text = text.replace('  onRetryDetail: () => void;', '  onRetryDetail?: () => void;')
text = text.replace('  onShowDetailCandidate: (songId: string) => void;', '  onShowDetailCandidate?: (songId: string) => void;')
text = text.replace('          onBack={props.onBackFromDetail}\n          onClose={props.onBackFromDetail}\n          onRetry={props.onRetryDetail}\n          onShowCandidate={props.onShowDetailCandidate}', '          onBack={() => props.onBackFromDetail?.()}\n          onClose={() => props.onBackFromDetail?.()}\n          onRetry={() => props.onRetryDetail?.()}\n          onShowCandidate={(songId) => props.onShowDetailCandidate?.(songId)}')
text = text.replace('onClick={() => props.onOpenDetail(candidate)}', 'onClick={() => props.onOpenDetail?.(candidate)}')
path.write_text(text, encoding='utf-8')
