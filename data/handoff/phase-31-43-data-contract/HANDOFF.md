# Church organy app — definitive Data Contract Gate handoff

Status: **PASS**

Source SQL: `24e7a91d-761d-42dc-9bdf-0d6a99d0cd67.sql`  
Source SQL SHA-256: `9ed2840dcf1c22c8836ebee1bf1c2597c08fd076f51a6e5f17bec4976e90d25e`

Definitive archive: `church-organy-data-contract-definitive.zip`  
Definitive archive SHA-256: `89edcf22f5603f51a4d1b27d94f8dfee4938a4fe4cfd3c950595d9bf4f0d1d54`

> This archive SHA-256 is the authoritative hash of the ZIP bytes stored on GitHub in branch `agent/phase-31-43-data-contract`. It supersedes the incorrect hash `51306667404cd0bf86df40e3bfecffb1117510060d14f486c245f05f5ae95f9a` that appeared in an earlier chat handoff prompt.

## Final source counts

- `CeskePisne`: **180**
- `PolskePisne`: **6**
- `CeskePolskePisne`: **59**
- `VarhaniciPisne`: **343**

`CeskePolskePisne` is a bijection:

- rows: **59**
- distinct Czech IDs: **59**
- distinct Polish IDs: **59**
- duplicate Czech IDs: **0**
- duplicate Polish IDs: **0**

## Last manual cleanup

`PolskePisne (142,144)` was replaced by `(144,142)`.
This changes only edge orientation/provenance, not melody-class membership.

## Expected import result

- Reference songs: **1,798**
- Non-singleton melody classes: **103**
- Singleton melody classes: **1450**
- Total melody classes: **1553**
- Jaroslav explicit repertoire pivots: **233**
- Effective playable songs: **442**
- Unresolved identities: **0**
- Duplicate/self/null edge defects: **0**
- Graph is a forest: **yes** (`245 = 348 - 103`)

## Files inside the definitive contract archive

- `A-melody-equivalence.json`
- `B-jaroslav-repertoire-pivots.json`
- `C-validation-report.json`
- `HANDOFF.md`

The archive stored beside this file is the definitive data contract and supersedes all previous data-contract bundles.
