import type { Pool, PoolClient } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import type { InteractionResult } from "./interaction-service";
import { displayReferenceNumber } from "./reference-catalog-contract";

export type RecommendedReferenceSong = { referenceSongId: string; language: "czech" | "polish"; canonicalNumber: number; displayNumber: string; title: string };
export type ReferenceAntiphonRecommendation = { antiphonId: string; recommendedSong: RecommendedReferenceSong | null };
type MutationResult = { kind: "ok"; value: ReferenceAntiphonRecommendation } | { kind: "antiphonNotFound" } | { kind: "songNotFound" };

export interface ReferenceAntiphonRecommendationRepository {
  get(antiphonId: string): Promise<ReferenceAntiphonRecommendation | undefined>;
  set(antiphonId: string, referenceSongId: string | null): Promise<MutationResult>;
}

type Row={antiphon_id:string;reference_song_id:string|null;language:"czech"|"polish"|null;canonical_number:number|null;title:string|null};
const readSql=`select a.id antiphon_id,r.reference_song_id,s.language,s.canonical_number,s.title
  from reference_antiphons a left join reference_antiphon_recommendations r on r.antiphon_id=a.id
  left join reference_catalog_songs s on s.id=r.reference_song_id where a.id=$1`;
function map(row:Row):ReferenceAntiphonRecommendation{return {antiphonId:row.antiphon_id,recommendedSong:row.reference_song_id===null?null:{referenceSongId:row.reference_song_id,language:row.language!,canonicalNumber:Number(row.canonical_number),displayNumber:displayReferenceNumber(Number(row.canonical_number)),title:row.title!}};}
async function read(db:Pick<Pool,"query">|Pick<PoolClient,"query">,id:string){const row=(await db.query(readSql,[id])).rows[0] as Row|undefined;return row?map(row):undefined;}
export class PgReferenceAntiphonRecommendationRepository implements ReferenceAntiphonRecommendationRepository {
  constructor(private readonly pool:Pool) {}
  async get(id:string){return read(this.pool,id);}
  async set(antiphonId:string,referenceSongId:string|null):Promise<MutationResult>{const client=await this.pool.connect();try{await client.query("begin");const antiphon=await client.query("select 1 from reference_antiphons where id=$1 for update",[antiphonId]);if(!antiphon.rows.length){await client.query("rollback");return{kind:"antiphonNotFound"};}if(referenceSongId!==null){const song=await client.query("select 1 from reference_catalog_songs where id=$1",[referenceSongId]);if(!song.rows.length){await client.query("rollback");return{kind:"songNotFound"};}await client.query("insert into reference_antiphon_recommendations(antiphon_id,reference_song_id,updated_at) values($1,$2,now()) on conflict(antiphon_id) do update set reference_song_id=excluded.reference_song_id,updated_at=now()",[antiphonId,referenceSongId]);}else await client.query("delete from reference_antiphon_recommendations where antiphon_id=$1",[antiphonId]);const value=await read(client,antiphonId);if(!value)throw new Error("Reference antiphon disappeared during recommendation update.");await client.query("commit");return{kind:"ok",value};}catch(error){await client.query("rollback").catch(()=>undefined);throw error;}finally{client.release();}}
}
export class ReferenceAntiphonRecommendationService {
  constructor(private readonly repo:ReferenceAntiphonRecommendationRepository){}
  async get(actor:ActorIdentity,antiphonId:string):Promise<InteractionResult<ReferenceAntiphonRecommendation>>{if(!actor.role)return fail("permissionDenied","An assigned role is required.");const value=await this.repo.get(antiphonId);return value?ok(value):fail("notFound","Reference antiphon was not found.");}
  async set(actor:ActorIdentity,antiphonId:string,referenceSongId:string|null):Promise<InteractionResult<ReferenceAntiphonRecommendation>>{if(actor.role!=="admin")return fail("permissionDenied","Only admin may manage Reference antiphon recommendations.");const result=await this.repo.set(antiphonId,referenceSongId);if(result.kind==="antiphonNotFound")return fail("notFound","Reference antiphon was not found.");if(result.kind==="songNotFound")return fail("notFound","Reference catalog record was not found.");return ok(result.value);}
}
const ok=<T>(value:T):InteractionResult<T>=>({success:true,value});const fail=<T>(code:"permissionDenied"|"notFound",message:string):InteractionResult<T>=>({success:false,error:{code,message}});
