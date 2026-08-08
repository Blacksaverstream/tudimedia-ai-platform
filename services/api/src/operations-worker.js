import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { Pool } from "pg";
import { PostgresOperationsStore } from "./operations/postgres-operations-store.js";
import { HttpOperationProvider, OperationWorker } from "./operations/operation-worker.js";
for(const name of ["DATABASE_URL","TRANSLATION_PROVIDER_ENDPOINT","TRANSLATION_PROVIDER_API_KEY","RENDER_PROVIDER_ENDPOINT","RENDER_PROVIDER_API_KEY"])if(!process.env[name])throw new Error(`${name} is required.`);
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==="false"?false:undefined});
const worker=new OperationWorker({store:new PostgresOperationsStore(pool),translationProvider:new HttpOperationProvider({endpoint:process.env.TRANSLATION_PROVIDER_ENDPOINT,apiKey:process.env.TRANSLATION_PROVIDER_API_KEY,kind:"translations"}),renderProvider:new HttpOperationProvider({endpoint:process.env.RENDER_PROVIDER_ENDPOINT,apiKey:process.env.RENDER_PROVIDER_API_KEY,kind:"renders"}),workerId:process.env.OPERATIONS_WORKER_ID||randomUUID()});
let stopping=false;process.on("SIGTERM",()=>{stopping=true});process.on("SIGINT",()=>{stopping=true});while(!stopping){if(!await worker.processNext())await wait(Number(process.env.OPERATIONS_WORKER_POLL_MS??1000));}await pool.end();
