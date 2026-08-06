export type MelodyCollisionRowInput = {
  rowId: number;
  rowLabel: string;
  songId?: string;
  melodyClassId?: string;
};

export type MelodyCollisionParticipant = {
  rowId: number;
  rowLabel: string;
  songId: string;
};

export type MelodyCollision = {
  melodyClassId: string;
  rows: MelodyCollisionParticipant[];
};

export type MelodyCollisionRowIssue = {
  rowId: number;
  melodyClassId: string;
  message: string;
  conflictingRows: Array<{ rowId: number; label: string }>;
};

export function findMelodyCollisions(rows: MelodyCollisionRowInput[]): MelodyCollision[] {
  const groups = new Map<string, MelodyCollisionParticipant[]>();
  for (const row of rows) {
    if (!row.songId || !row.melodyClassId) continue;
    groups.set(row.melodyClassId, [
      ...(groups.get(row.melodyClassId) ?? []),
      { rowId: row.rowId, rowLabel: row.rowLabel, songId: row.songId },
    ]);
  }
  return [...groups.entries()]
    .filter(([, participants]) => participants.length > 1)
    .map(([melodyClassId, participants]) => ({
      melodyClassId,
      rows: [...participants].sort(compareParticipants),
    }))
    .sort((left, right) => compareParticipants(left.rows[0], right.rows[0]) || left.melodyClassId.localeCompare(right.melodyClassId));
}

export function melodyCollisionRowIssues(collisions: MelodyCollision[]): MelodyCollisionRowIssue[] {
  return collisions.flatMap((collision) => collision.rows.map((row) => {
    const conflictingRows = collision.rows
      .filter((candidate) => candidate.rowId !== row.rowId)
      .map((candidate) => ({ rowId: candidate.rowId, label: candidate.rowLabel }));
    return {
      rowId: row.rowId,
      melodyClassId: collision.melodyClassId,
      message: `This melody is also used in ${joinLabels(conflictingRows.map((candidate) => candidate.label))}.`,
      conflictingRows,
    };
  })).sort((left, right) => left.rowId - right.rowId || left.melodyClassId.localeCompare(right.melodyClassId));
}

export function melodyCollisionSummary(collisions: MelodyCollision[]): string | undefined {
  if (collisions.length === 0) return undefined;
  const groups = collisions.map((collision) => joinLabels(collision.rows.map((row) => row.rowLabel)));
  return `Cannot finalize: the same melody is used in ${joinLabels(groups)}.`;
}

function compareParticipants(left: MelodyCollisionParticipant, right: MelodyCollisionParticipant): number {
  return left.rowId - right.rowId || left.rowLabel.localeCompare(right.rowLabel) || left.songId.localeCompare(right.songId);
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "another row";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
