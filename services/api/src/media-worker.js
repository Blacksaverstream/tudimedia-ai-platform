import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { Pool } from "pg";
import { S3ObjectStorage } from "./assets/object-storage.js";
import { ClamAvScanner } from "./media/clamav-scanner.js";
import { FfmpegProcessor } from "./media/ffmpeg-processor.js";
import { MediaWorker } from "./media/media-worker.js";
import { PostgresMediaJobStore } from "./media/postgres-media-job-store.js";

for (const name of ["DATABASE_URL", "S3_BUCKET", "S3_REGION"]) if (!process.env[name]) throw new Error(`${name} is required.`);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? false : undefined });
const worker = new MediaWorker({
  store: new PostgresMediaJobStore(pool),
  objectStorage: new S3ObjectStorage({ bucket: process.env.S3_BUCKET, region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" }),
  scanner: new ClamAvScanner({ command: process.env.CLAMD_SCAN_PATH || "clamdscan" }),
  videoProcessor: new FfmpegProcessor({ ffmpegCommand: process.env.FFMPEG_PATH || "ffmpeg", ffprobeCommand: process.env.FFPROBE_PATH || "ffprobe" }),
  workerId: process.env.MEDIA_WORKER_ID || randomUUID()
});

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
while (!stopping) {
  const processed = await worker.processNext();
  if (!processed) await wait(Number(process.env.MEDIA_WORKER_POLL_MS ?? 1000));
}
await pool.end();
