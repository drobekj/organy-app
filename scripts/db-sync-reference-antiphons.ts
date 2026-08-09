import { Pool } from "pg";import { synchronizeProductionReferenceAntiphons } from "../src/application/reference-antiphon-sync";
async function main(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required to synchronize reference antiphons.");const pool=new Pool({connectionString:process.env.DATABASE_URL});try{const c=await synchronizeProductionReferenceAntiphons(pool);console.log(`Reference antiphons synchronized: Czech ${c.czech}, Polish ${c.polish}, Total ${c.total}`);}finally{await pool.end();}}
void main().catch(e=>{console.error(e);process.exitCode=1;});
