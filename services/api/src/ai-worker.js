import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { Pool } from "pg";
import { AiWorker } from "./ai/ai-worker.js";
import { HttpAiProvider } from "./ai/http-ai-provider.js";
import { PostgresAiStore } from "./ai/postgres-ai-store.js";
import { S3ObjectStorage } from "./assets/object-storage.js";

for (const name of ["DATABASE_URL", "S3_BUCKET", "S3_REGION", "AI_PROVIDER_ENDPOINT", "AI_PROVIDER_API_KEY", "AI_PROVIDER_NAME", "AI_MODEL", "AI_PROMPT_VERSION"]) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? false : undefined });
const worker = new AiWorker({
  store: new PostgresAiStore(pool),
  objectStorage: new S3ObjectStorage({ bucket: process.env.S3_BUCKET, region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" }),
  provider: new HttpAiProvider({ endpoint: process.env.AI_PROVIDER_ENDPOINT, apiKey: process.env.AI_PROVIDER_API_KEY, provider: process.env.AI_PROVIDER_NAME, model: process.env.AI_MODEL, promptVersion: process.env.AI_PROMPT_VERSION }),
  workerId: process.env.AI_WORKER_ID || randomUUID(),
  reviewThreshold: Number(process.env.AI_REVIEW_THRESHOLD ?? 0.75)
});

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
while (!stopping) {
  const processed = await worker.processNext();
  if (!processed) await wait(Number(process.env.AI_WORKER_POLL_MS ?? 1000));
}
await pool.end();
