import type { Pool } from "pg";

export type ReferenceMelodyClassMembership = {
  songId: string;
  melodyClassId: string;
};

export interface ReferenceMelodyClassProvider {
  getClassMemberships(songIds: string[]): Promise<ReferenceMelodyClassMembership[]>;
}

export class PostgresReferenceMelodyClassProvider implements ReferenceMelodyClassProvider {
  constructor(private readonly pool: Pool) {}

  async getClassMemberships(songIds: string[]): Promise<ReferenceMelodyClassMembership[]> {
    const uniqueIds = [...new Set(songIds)].filter((songId) => /^(czech|polish):[1-9]\d*$/.test(songId));
    if (uniqueIds.length === 0) return [];
    const { rows } = await this.pool.query(
      `select reference_song_id, class_id
       from reference_song_melody_memberships
       where reference_song_id = any($1::text[])
       order by reference_song_id`,
      [uniqueIds],
    );
    return rows.map((row) => ({ songId: String(row.reference_song_id), melodyClassId: String(row.class_id) }));
  }
}
