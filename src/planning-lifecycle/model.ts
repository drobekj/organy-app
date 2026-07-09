export type ServiceLanguage = 'czech' | 'polish' | 'mixed';

export type ConcreteSongLanguage = Exclude<ServiceLanguage, 'mixed'>;

export type SongReference = {
  language: ConcreteSongLanguage;
  number: string;
};

export type ServiceSetStatus = 'none' | 'working' | 'final' | 'completed';

export type ServiceSetRow = {
  order: number;
  song?: SongReference;
  note?: string;
};

export type CompletedServiceRow = {
  order: number;
  song?: SongReference;
  note?: string;
};

export type PlanningRole =
  | 'priest'
  | 'organist'
  | 'admin'
  | 'congregationMember'
  | 'system';

export type PlanningAction =
  | 'createWorkingSet'
  | 'editWorkingSet'
  | 'deleteWorkingSet'
  | 'saveFinalSet'
  | 'deleteFinalSet'
  | 'convertFinalSetToCompletedService';
