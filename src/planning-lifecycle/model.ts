export type ServiceLanguage = "czech" | "polish" | "mixed";

export type ConcreteSongLanguage = "czech" | "polish";

export type ServiceSetStatus = "working" | "final";

export type PlanningRole = "priest" | "organist" | "admin" | "congregationMember";

export type SongReference = {
  number: string;
  language: ConcreteSongLanguage;
};

export type PlanningRow = {
  song?: SongReference;
  note?: string;
};

export type ServicePersonReference = {
  id?: string;
  displayName: string;
};

export type ServiceContext = {
  serviceDate: string;
  language: ServiceLanguage;
  priest: ServicePersonReference;
  organist: ServicePersonReference;
};

export type PlanningSet = {
  status: ServiceSetStatus;
  language: ServiceLanguage;
  rows: PlanningRow[];
};
