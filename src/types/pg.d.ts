declare module "pg" {
  export type PoolConfig = Record<string, unknown>;
  export type QueryResult = unknown;

  export class Pool {
    constructor(config?: PoolConfig);
    end(): Promise<void>;
  }
}
