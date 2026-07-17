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

export type ServiceContext = {
  serviceDate: string;
  serviceTime: string;
  language: ServiceLanguage;
  priest: ServicePersonReference;
  organist: ServicePersonReference;
};

export type PlanningSet = {
  status: ServiceSetStatus;
  language: ServiceLanguage;
  rows: PlanningRow[];
};
