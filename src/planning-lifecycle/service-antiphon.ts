import type { ConcreteSongLanguage, ServiceAntiphonReference, ServiceLanguage } from "./model";

export function serviceAntiphonLanguageFromId(id: string): ConcreteSongLanguage | undefined {
  const match = /^(czech|polish):[1-9]\d*$/.exec(id);
  return match?.[1] as ConcreteSongLanguage | undefined;
}

export function serviceAntiphonMatchesLanguage(reference: ServiceAntiphonReference, serviceLanguage: ServiceLanguage): boolean {
  const language = serviceAntiphonLanguageFromId(reference.id);
  return Boolean(language) && (serviceLanguage === "mixed" || language === serviceLanguage);
}
