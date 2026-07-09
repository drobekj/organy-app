export type ServiceSetStatus = "working" | "final";

export type PlanningRole = "priest" | "organist" | "admin" | "congregationMember";

export type ServiceSetId = string;
export type CompletedServiceId = string;
export type ServiceContextId = string;
export type PlanningActorId = string;

export type SongReference = {
  readonly language: string;
  readonly number: string;
};

export type ServiceSetRow = {
  readonly id: string;
  readonly position: number;
  readonly label?: string;
  readonly song?: SongReference;
  readonly note?: string;
};

export type ServiceSet = {
  readonly id: ServiceSetId;
  readonly serviceContextId: ServiceContextId;
  readonly status: ServiceSetStatus;
  readonly rows: readonly ServiceSetRow[];
  readonly priestId: PlanningActorId;
  readonly organistId: PlanningActorId;
};

export type CompletedServiceRow = ServiceSetRow;

export type CompletedService = {
  readonly id: CompletedServiceId;
  readonly sourceServiceSetId: ServiceSetId;
  readonly serviceContextId: ServiceContextId;
  readonly rows: readonly CompletedServiceRow[];
  readonly priestId: PlanningActorId;
  readonly organistId: PlanningActorId;
};
