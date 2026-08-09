export type ServiceLanguage = "czech" | "polish" | "mixed";

export type ConcreteSongLanguage = "czech" | "polish";

export type ServiceSetStatus = "working" | "final";

export type PlanningRole = "priest" | "organist" | "admin" | "congregationMember";

export type SongReference = {
  songId?: string;
  number: string;
  language: ConcreteSongLanguage;
  title?: string;
};

export type PlanningRow = {
  song?: SongReference;
  note?: string;
};

export type ServicePersonReference = {
  id?: string;
  displayName: string;
};

/** Stable authoritative antiphon identity plus the historical snapshot saved with a service. */
export type ServiceAntiphonReference = {
  id: string;
  displayNumber: string;
  title: string;
  sourceUrl?: string;
};

/** Stable authoritative thematic-section identity plus the historical title snapshot saved with a service. */
export type ServiceTopicReference = {
  id: string;
  title: string;
};

export type ServiceContext = {
  serviceDate: string;
  serviceTime: string;
  language: ServiceLanguage;
  priest: ServicePersonReference;
  organist: ServicePersonReference;
  /** Optional service-level note. Whitespace-only values are normalized away before persistence. */
  note?: string;
  /** Optional authoritative Czech/Polish antiphon snapshot selected for this concrete service. */
  referenceAntiphon?: ServiceAntiphonReference;
  /** Optional authoritative Czech/Polish Topic snapshot selected for this concrete service. */
  referenceTopic?: ServiceTopicReference;
  /** Optional synthetic/demo antiphon key used to rehydrate candidate metadata. */
  antiphonKey?: string;
  /** Optional synthetic/demo liturgical season key retained for legacy/internal compatibility. */
  liturgicalSeasonKey?: string;
};

export type PlanningSet = {
  status: ServiceSetStatus;
  language: ServiceLanguage;
  rows: PlanningRow[];
};
