declare module "pg" {
  export type PoolConfig = Record<string, unknown>;
  export type QueryResult = unknown;

  export type PoolClient = {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    release(): void;
  };

  export class Pool {
    constructor(config?: PoolConfig);
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}
