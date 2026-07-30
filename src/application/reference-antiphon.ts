import catalog from "../../data/catalog/catalog-czech-antiphons.json";
import type { ReferenceAntiphonPage, ReferenceAntiphonProvider, ReferenceAntiphonQuery, ReferenceAntiphonRecord } from "./reference-antiphon-contract";
type Raw={number:number;title:string;url:string};
export const referenceAntiphonRecords: ReferenceAntiphonRecord[]=(catalog as Raw[]).map(r=>({id:`czech:${r.number}`,language:"czech",canonicalNumber:r.number,displayNumber:String(r.number),title:r.title,sourceUrl:r.url}));
export class MemoryReferenceAntiphonProvider implements ReferenceAntiphonProvider {
 constructor(private readonly records=referenceAntiphonRecords) {}
 async list(input:ReferenceAntiphonQuery={}):Promise<ReferenceAntiphonPage>{const language=input.language??"all",search=input.search?.trim()??"";const filtered=this.records.filter(r=>(language==="all"||r.language===language)&&(!search||(/^\d+$/.test(search)?r.canonicalNumber===Number(search):r.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))));const pageSize=input.pageSize??50,pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)),page=Math.min(input.page??0,pageCount-1);return{records:filtered.slice(page*pageSize,(page+1)*pageSize),total:filtered.length,page,pageSize,pageCount,counts:{all:116,czech:116,polish:0}};}
 async getById(id:string){return this.records.find(r=>r.id===id);}
}
