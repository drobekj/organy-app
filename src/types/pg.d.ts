declare module "pg" {
  export type PoolConfig = Record<string, unknown>;
  export type QueryResult = unknown;

  export class Pool {
    constructor(config?: PoolConfig);
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    end(): Promise<void>;
  }
}
