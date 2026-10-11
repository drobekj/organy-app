import fingeringFiles from "../../data/fingering-manifest.json";

export type FingeringArtifact = {
  filename: string;
  catalogId: string;
  version?: string;
  sequence: string;
  url: string;
};

export type FingeringLink = FingeringArtifact & {
  label: string;
};

const fingeringFilenamePattern = /^EK(\d+)([A-Z])?-(\d{3})_fingering\.pdf$/;

export function parseFingeringFilename(filename: string): FingeringArtifact | undefined {
  const match = filename.match(fingeringFilenamePattern);
  if (!match) return undefined;
  const [, catalogId, version, sequence] = match;
  return {
    filename,
    catalogId,
    ...(version ? { version } : {}),
    sequence,
    url: `/fingering/${filename}`,
  };
}

const fingeringArtifacts = fingeringFiles
  .map(parseFingeringFilename)
  .filter((artifact): artifact is FingeringArtifact => Boolean(artifact))
  .sort((left, right) =>
    Number(left.catalogId) - Number(right.catalogId)
    || (left.version ?? "").localeCompare(right.version ?? "")
    || Number(left.sequence) - Number(right.sequence)
    || left.filename.localeCompare(right.filename)
  );

export function fingeringLinksForSongId(songId: string): FingeringLink[] {
  const songMatch = songId.match(/^czech:(\d+)$/);
  if (!songMatch) return [];
  const artifacts = fingeringArtifacts.filter((artifact) => artifact.catalogId === songMatch[1]);
  return artifacts.map((artifact) => ({
    ...artifact,
    label: fingeringLabel(artifact, artifacts.length),
  }));
}

function fingeringLabel(artifact: FingeringArtifact, total: number): string {
  if (total === 1 && !artifact.version) return "Fingering";
  const suffix = artifact.version ? `${artifact.version}-${artifact.sequence}` : artifact.sequence;
  return `Fingering ${suffix}`;
}
