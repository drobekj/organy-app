import type { DefinitiveContract } from "./phase-31-43-contract";

function key(language: "czech" | "polish", number: number): string {
  return `${language}:${number}`;
}

/** Independent raw connectivity/cycle check for the definitive melody graph.
 * The data-contract parser already validates counts, endpoints and uniqueness;
 * this proves each declared non-singleton class is exactly one tree.
 */
export function validateDefinitiveMelodyForest(contract: DefinitiveContract): void {
  let edgeCount = 0;
  let memberCount = 0;
  for (const melodyClass of contract.melodyClasses) {
    const members = new Set(melodyClass.members.map((member) => key(member.language, member.number)));
    const adjacency = new Map<string, string[]>([...members].map((member) => [member, []]));
    for (const edge of melodyClass.provenanceEdges) {
      const a = key(edge.a.language, edge.a.number);
      const b = key(edge.b.language, edge.b.number);
      if (!members.has(a) || !members.has(b)) throw new Error(`Melody class ${melodyClass.classId} contains an edge outside its member set.`);
      adjacency.get(a)!.push(b);
      adjacency.get(b)!.push(a);
      edgeCount += 1;
    }
    memberCount += members.size;
    if (melodyClass.provenanceEdges.length !== members.size - 1) throw new Error(`Melody class ${melodyClass.classId} does not have tree edge count.`);
    const start = members.values().next().value as string | undefined;
    if (!start) throw new Error(`Melody class ${melodyClass.classId} is empty.`);
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const neighbor of adjacency.get(current) ?? []) if (!seen.has(neighbor)) stack.push(neighbor);
    }
    if (seen.size !== members.size) throw new Error(`Melody class ${melodyClass.classId} is disconnected.`);
  }
  if (memberCount !== 348 || edgeCount !== 245 || contract.melodyClasses.length !== 103 || edgeCount !== memberCount - contract.melodyClasses.length) {
    throw new Error("Definitive melody graph forest invariant failed.");
  }
}
