import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { Pool } from "pg";
import { PostgresOperationsStore } from "./operations/postgres-operations-store.js";
import { HttpNotificationProvider, NotificationWorker } from "./operations/notification-worker.js";
for(const name of ["DATABASE_URL","NOTIFICATION_PROVIDER_ENDPOINT","NOTIFICATION_PROVIDER_API_KEY"])if(!process.env[name])throw new Error(`${name} is required.`);
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==="false"?false:undefined});const worker=new NotificationWorker({store:new PostgresOperationsStore(pool),provider:new HttpNotificationProvider({endpoint:process.env.NOTIFICATION_PROVIDER_ENDPOINT,apiKey:process.env.NOTIFICATION_PROVIDER_API_KEY}),workerId:process.env.NOTIFICATION_WORKER_ID||randomUUID()});let stopping=false;process.on("SIGTERM",()=>{stopping=true});process.on("SIGINT",()=>{stopping=true});while(!stopping){if(!await worker.processNext())await wait(Number(process.env.NOTIFICATION_WORKER_POLL_MS??1000));}await pool.end();
