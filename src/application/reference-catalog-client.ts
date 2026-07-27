import { referenceCatalog, type ReferenceCatalogPage, type ReferenceCatalogQuery, type ReferenceCatalogRecord } from "./reference-catalog";

export type ReferenceCatalogClient = {
  list(input: ReferenceCatalogQuery): Promise<ReferenceCatalogPage>;
  getById(id: string): Promise<ReferenceCatalogRecord | undefined>;
};

type ReferenceCatalogTransport = (action: "list" | "getById", input: unknown) => Promise<unknown>;

async function defaultTransport(action: "list" | "getById", input: unknown): Promise<unknown> {
  const response = await fetch("/api/reference-catalog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
  const payload = await response.json() as { error?: unknown };
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Reference catalog API request failed.");
  return payload;
}

/** Browser-facing read-only client for the dedicated reference catalog boundary. */
export class DbReferenceCatalogClient implements ReferenceCatalogClient {
  constructor(private readonly transport: ReferenceCatalogTransport = defaultTransport) {}
  async list(input: ReferenceCatalogQuery): Promise<ReferenceCatalogPage> { return await this.transport("list", input) as ReferenceCatalogPage; }
  async getById(id: string): Promise<ReferenceCatalogRecord | undefined> { return await this.transport("getById", { id }) as ReferenceCatalogRecord | undefined; }
}

/** Async facade preserves the accepted bundled provider only in memory runtime. */
export class MemoryReferenceCatalogClient implements ReferenceCatalogClient {
  async list(input: ReferenceCatalogQuery): Promise<ReferenceCatalogPage> { return referenceCatalog.list(input); }
  async getById(id: string): Promise<ReferenceCatalogRecord | undefined> { return referenceCatalog.getById(id); }
}
