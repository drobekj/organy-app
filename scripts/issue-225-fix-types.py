from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "app/planning-lifecycle-client.tsx",
    'const byId = new Map(result.value.map((song: CatalogSong) => [song.songId, song]));',
    'const byId = new Map<string, CatalogSong>((result.value as CatalogSong[]).map((song) => [song.songId, song]));',
)

replace_once(
    "src/db/app-pool.ts",
    '  attachDatabasePool(pool);',
    '''  // @vercel/functions documents node-postgres Pool as supported, while the
  // current DbPool union declaration does not structurally accept pg.Pool.
  attachDatabasePool(pool as unknown as Parameters<typeof attachDatabasePool>[0]);''',
)

print("Issue #225 type boundaries corrected.")
