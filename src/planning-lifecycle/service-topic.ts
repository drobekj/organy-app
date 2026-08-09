import type { ConcreteSongLanguage, ServiceLanguage, ServiceTopicReference } from "./model";

export function serviceTopicLanguageFromId(id: string): ConcreteSongLanguage | undefined {
  if (id.startsWith("czech:")) return "czech";
  if (id.startsWith("polish:")) return "polish";
  return undefined;
}

export function serviceTopicMatchesLanguage(topic: Pick<ServiceTopicReference, "id">, serviceLanguage: ServiceLanguage): boolean {
  const topicLanguage = serviceTopicLanguageFromId(topic.id);
  return Boolean(topicLanguage && (serviceLanguage === "mixed" || topicLanguage === serviceLanguage));
}
