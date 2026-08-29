export type ReferenceMelodyEdgeEditorMode = "incomplete" | "self" | "checking" | "add" | "remove";

export function resolveReferenceMelodyEdgeEditorMode(
  firstReferenceSongId: string | undefined,
  secondReferenceSongId: string | undefined,
  edgeExists: boolean | undefined,
): ReferenceMelodyEdgeEditorMode {
  if (!firstReferenceSongId || !secondReferenceSongId) return "incomplete";
  if (firstReferenceSongId === secondReferenceSongId) return "self";
  if (edgeExists === undefined) return "checking";
  return edgeExists ? "remove" : "add";
}

export function isOutsideReferenceMelodyClass(
  referenceSongId: string,
  firstReferenceSongId: string | undefined,
  firstClassMemberIds: ReadonlySet<string> | undefined,
): boolean {
  if (!firstReferenceSongId || !firstClassMemberIds) return false;
  return !firstClassMemberIds.has(referenceSongId);
}
