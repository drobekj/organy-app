import type { Pool, PoolClient } from "pg";

export type ReferenceMelodyGraphSong = {
  id: string;
  language: "czech" | "polish";
  canonicalNumber: number;
};

export type ReferenceMelodyEdge = {
  songAId: string;
  songBId: string;
};

export type ReferenceMelodyPartition = {
  classBySongId: Map<string, string>;
  classCount: number;
};

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export class ReferenceMelodyEdgeInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceMelodyEdgeInvariantError";
  }
}

function fail(message: string): never {
  throw new ReferenceMelodyEdgeInvariantError(message);
}

export function normalizeReferenceMelodyEdge(songIdA: string, songIdB: string): ReferenceMelodyEdge {
  if (!songIdA || !songIdB) fail("Reference melody edge endpoints are required.");
  if (songIdA === songIdB) fail("A Reference melody edge cannot connect a song to itself.");
  return songIdA < songIdB
    ? { songAId: songIdA, songBId: songIdB }
    : { songAId: songIdB, songBId: songIdA };
}

function compareSongIdentity(a: ReferenceMelodyGraphSong, b: ReferenceMelodyGraphSong): number {
  const languageOrder = (a.language === "czech" ? 0 : 1) - (b.language === "czech" ? 0 : 1);
  return languageOrder || a.canonicalNumber - b.canonicalNumber || a.id.localeCompare(b.id);
}

export function deriveReferenceMelodyPartition(
  songs: ReferenceMelodyGraphSong[],
  edges: ReferenceMelodyEdge[],
): ReferenceMelodyPartition {
  const byId = new Map<string, ReferenceMelodyGraphSong>();
  for (const song of songs) {
    if (byId.has(song.id)) fail(`Duplicate Reference song identity ${song.id}.`);
    byId.set(song.id, song);
  }

  const parent = new Map<string, string>();
  for (const song of songs) parent.set(song.id, song.id);

  const find = (id: string): string => {
    const current = parent.get(id);
    if (!current) fail(`Reference melody graph contains unknown song ${id}.`);
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const seenEdges = new Set<string>();
  for (const rawEdge of edges) {
    const edge = normalizeReferenceMelodyEdge(rawEdge.songAId, rawEdge.songBId);
    if (!byId.has(edge.songAId) || !byId.has(edge.songBId)) {
      fail(`Reference melody edge ${edge.songAId}<->${edge.songBId} points outside the Reference catalog.`);
    }
    const key = `${edge.songAId}<->${edge.songBId}`;
    if (seenEdges.has(key)) fail(`Duplicate Reference melody edge ${key}.`);
    seenEdges.add(key);
    union(edge.songAId, edge.songBId);
  }

  const membersByRoot = new Map<string, ReferenceMelodyGraphSong[]>();
  for (const song of songs) {
    const root = find(song.id);
    const members = membersByRoot.get(root) ?? [];
    members.push(song);
    membersByRoot.set(root, members);
  }

  const classBySongId = new Map<string, string>();
  for (const members of membersByRoot.values()) {
    const anchor = [...members].sort(compareSongIdentity)[0];
    const classId = `reference-melody:${anchor.id}`;
    for (const member of members) classBySongId.set(member.id, classId);
  }

  if (classBySongId.size !== songs.length) fail("Every Reference song must resolve to exactly one melody component.");
  return { classBySongId, classCount: new Set(classBySongId.values()).size };
}

export async function readReferenceMelodyGraph(db: Queryable): Promise<{
  songs: ReferenceMelodyGraphSong[];
  edges: ReferenceMelodyEdge[];
}> {
  const [songResult, edgeResult] = await Promise.all([
    db.query("select id, language, canonical_number from reference_catalog_songs order by language, canonical_number, id"),
    db.query("select song_a_id, song_b_id from reference_melody_edges order by song_a_id, song_b_id"),
  ]);
  const songs = songResult.rows.map((row) => ({
    id: String(row.id),
    language: row.language as "czech" | "polish",
    canonicalNumber: Number(row.canonical_number),
  }));
  const edges = edgeResult.rows.map((row) => ({
    songAId: String(row.song_a_id),
    songBId: String(row.song_b_id),
  }));
  return { songs, edges };
}

export async function readCurrentReferenceMelodyClassMap(db: Queryable): Promise<Map<string, string>> {
  const result = await db.query(
    "select reference_song_id, class_id from reference_song_melody_memberships order by reference_song_id",
  );
  const classBySongId = new Map<string, string>();
  for (const row of result.rows) {
    const songId = String(row.reference_song_id);
    if (classBySongId.has(songId)) fail(`Duplicate Reference melody membership for ${songId}.`);
    classBySongId.set(songId, String(row.class_id));
  }
  return classBySongId;
}

export function assertSameReferenceMelodyPartition(
  actual: Map<string, string>,
  expected: Map<string, string>,
  context = "Reference melody partition",
): void {
  if (actual.size !== expected.size) {
    fail(`${context} has ${actual.size} memberships; expected ${expected.size}.`);
  }
  for (const [songId, expectedClassId] of expected) {
    const actualClassId = actual.get(songId);
    if (actualClassId !== expectedClassId) {
      fail(`${context} mismatch for ${songId}: ${String(actualClassId)} !== ${expectedClassId}.`);
    }
  }
}

export async function assertReferenceMelodyStorageInvariant(
  db: Queryable,
  songs: ReferenceMelodyGraphSong[],
): Promise<Map<string, string>> {
  const current = await readCurrentReferenceMelodyClassMap(db);
  if (current.size !== songs.length) {
    fail(`Reference melody membership count ${current.size} does not match Reference song count ${songs.length}.`);
  }
  for (const song of songs) {
    if (!current.has(song.id)) fail(`Reference song ${song.id} has no melody membership.`);
  }

  const classResult = await db.query("select id from reference_melody_classes order by id");
  const classIds = new Set(classResult.rows.map((row) => String(row.id)));
  const referenced = new Set(current.values());
  if (classIds.size !== classResult.rows.length) fail("Duplicate Reference melody class id detected.");
  if (classIds.size !== referenced.size || [...classIds].some((id) => !referenced.has(id))) {
    fail("Reference melody classes contain an orphan or a missing referenced class.");
  }
  return current;
}

async function writeDesiredMemberships(client: Pick<PoolClient, "query">, desired: Map<string, string>): Promise<void> {
  await client.query("drop table if exists pg_temp.desired_reference_melody_memberships");
  await client.query("create temp table desired_reference_melody_memberships (reference_song_id text primary key, class_id text not null) on commit drop");
  const entries = [...desired.entries()];
  for (let start = 0; start < entries.length; start += 400) {
    const chunk = entries.slice(start, start + 400);
    const values: string[] = [];
    const params: string[] = [];
    for (const [songId, classId] of chunk) {
      const offset = values.length;
      values.push(songId, classId);
      params.push(`($${offset + 1}, $${offset + 2})`);
    }
    await client.query(
      `insert into desired_reference_melody_memberships(reference_song_id,class_id) values ${params.join(",")}`,
      values,
    );
  }
}

export async function recomputeReferenceMelodyPartition(
  client: Pick<PoolClient, "query">,
  options: { failAfterMembershipUpdate?: boolean } = {},
): Promise<{ classCount: number; membershipCount: number; changedMemberships: number }> {
  const { songs, edges } = await readReferenceMelodyGraph(client);
  await assertReferenceMelodyStorageInvariant(client, songs);
  const desired = deriveReferenceMelodyPartition(songs, edges);
  await writeDesiredMemberships(client, desired.classBySongId);

  await client.query(
    "insert into reference_melody_classes(id) select distinct class_id from desired_reference_melody_memberships on conflict do nothing",
  );
  const updated = await client.query(`
    update reference_song_melody_memberships m
       set class_id=d.class_id, updated_at=now()
      from desired_reference_melody_memberships d
     where m.reference_song_id=d.reference_song_id
       and m.class_id<>d.class_id
    returning m.reference_song_id
  `);
  if (options.failAfterMembershipUpdate) throw new Error("Injected Reference melody recompute failure after membership update.");

  await client.query(
    "delete from reference_melody_classes c where not exists (select 1 from reference_song_melody_memberships m where m.class_id=c.id)",
  );

  const actual = await assertReferenceMelodyStorageInvariant(client, songs);
  assertSameReferenceMelodyPartition(actual, desired.classBySongId, "Recomputed Reference melody partition");
  return {
    classCount: desired.classCount,
    membershipCount: desired.classBySongId.size,
    changedMemberships: updated.rows.length,
  };
}
