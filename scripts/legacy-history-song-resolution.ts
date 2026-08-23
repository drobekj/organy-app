import type { LegacyLanguage, LegacyRow, LegacyService } from "./legacy-history-parser";

export type LegacySongCorrection = {
  language: LegacyLanguage;
  legacyNumber: number;
  canonicalNumber: number;
  source: "explicit-user-correction" | "single-used-variant";
};

export type LegacyVariantEvidence = {
  language: LegacyLanguage;
  legacyNumber: number;
  variants: Array<{ canonicalNumber: number; occurrences: number }>;
  selectedCanonicalNumber?: number;
};

const EXPLICIT_CORRECTIONS: LegacySongCorrection[] = [
  {
    language: "czech",
    legacyNumber: 860,
    canonicalNumber: 680,
    source: "explicit-user-correction",
  },
];

const VARIANT_FAMILIES: Array<{
  language: LegacyLanguage;
  legacyNumber: number;
  canonicalNumbers: number[];
}> = [
  { language: "czech", legacyNumber: 52, canonicalNumbers: [5210, 5220] },
  { language: "czech", legacyNumber: 376, canonicalNumbers: [3761, 3762] },
  { language: "czech", legacyNumber: 683, canonicalNumbers: [6831, 6832] },
  { language: "czech", legacyNumber: 733, canonicalNumbers: [7331, 7332] },
  { language: "polish", legacyNumber: 438, canonicalNumbers: [4381, 4382] },
  { language: "polish", legacyNumber: 657, canonicalNumbers: [6571, 6572] },
];

export function buildLegacySongCorrections(
  services: LegacyService[],
  rows: LegacyRow[],
  referenceKeys: ReadonlySet<string>,
): { corrections: Map<string, LegacySongCorrection>; variantEvidence: LegacyVariantEvidence[] } {
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const corrections = new Map<string, LegacySongCorrection>();

  for (const correction of EXPLICIT_CORRECTIONS) {
    const targetKey = songKey(correction.language, correction.canonicalNumber);
    if (!referenceKeys.has(targetKey)) {
      throw new Error(
        `Legacy correction target is missing from Reference catalog: ${songKey(correction.language, correction.legacyNumber)} -> ${targetKey}.`,
      );
    }
    corrections.set(songKey(correction.language, correction.legacyNumber), correction);
  }

  const variantEvidence = VARIANT_FAMILIES.map((family) => {
    const variants = family.canonicalNumbers.map((canonicalNumber) => ({
      canonicalNumber,
      occurrences: rows.filter((row) => {
        if (row.songNumber !== canonicalNumber) return false;
        return serviceById.get(row.serviceId)?.language === family.language;
      }).length,
    }));
    const usedVariants = variants.filter((variant) => variant.occurrences > 0);
    const selectedCanonicalNumber = usedVariants.length === 1 ? usedVariants[0].canonicalNumber : undefined;

    if (selectedCanonicalNumber !== undefined) {
      const targetKey = songKey(family.language, selectedCanonicalNumber);
      if (!referenceKeys.has(targetKey)) {
        throw new Error(`Observed legacy variant is missing from Reference catalog: ${targetKey}.`);
      }
      corrections.set(songKey(family.language, family.legacyNumber), {
        language: family.language,
        legacyNumber: family.legacyNumber,
        canonicalNumber: selectedCanonicalNumber,
        source: "single-used-variant",
      });
    }

    return {
      language: family.language,
      legacyNumber: family.legacyNumber,
      variants,
      ...(selectedCanonicalNumber === undefined ? {} : { selectedCanonicalNumber }),
    };
  });

  return { corrections, variantEvidence };
}

export function correctedCanonicalNumber(
  language: LegacyLanguage,
  legacyNumber: number,
  corrections: ReadonlyMap<string, LegacySongCorrection>,
) {
  return corrections.get(songKey(language, legacyNumber))?.canonicalNumber ?? legacyNumber;
}

export function songKey(language: LegacyLanguage, number: number) {
  return `${language}:${number}`;
}
