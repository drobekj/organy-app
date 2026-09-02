export const DEMO_D1_FIXTURE = Object.freeze({
  version: "d1",
  title: "Church Organ Planner Demo",
  people: Object.freeze([
    Object.freeze({ id: "demo-fixture-priest", displayName: "Demo Priest", role: "priest" as const }),
    Object.freeze({ id: "demo-fixture-organist", displayName: "Demo Organist", role: "organist" as const }),
  ]),
  plans: Object.freeze([
    Object.freeze({
      id: "demo-fixture-working",
      status: "working" as const,
      serviceDate: "2030-01-06",
      serviceTime: "10:00",
      language: "czech" as const,
    }),
  ]),
});

export type DemoD1Fixture = typeof DEMO_D1_FIXTURE;
