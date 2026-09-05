const TEMPORARY_VOTER_PREFIXES = [
  "congregation-voter:temporary:",
  "congregation-account:temporary:",
] as const;

export function congregationAdminVoterLabel(identityId: string, nickname: string): string {
  const prefix = TEMPORARY_VOTER_PREFIXES.find((candidate) => identityId.startsWith(candidate));
  if (!prefix) return nickname;

  const shortId = identityId
    .slice(prefix.length)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();

  return shortId ? `Anonymous voter · ${shortId}` : "Anonymous voter";
}
