import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { InMemoryMediaJobStore } from "../src/media/in-memory-media-job-store.js";
import { MediaWorker } from "../src/media/media-worker.js";

const asset = { id: "asset-1", organizationId: "org-1", storageKey: "org-1/asset-1/source/video.mp4", mimeType: "video/mp4", status: "queued" };
const malwareJob = { id: "job-1", organizationId: "org-1", assetId: "asset-1", jobType: "malware_scan", status: "queued", attempts: 0 };
const storage = () => ({
  uploads: [],
  async downloadToFile(_key, filePath) { await writeFile(filePath, "test media"); },
  async uploadFile(value) { this.uploads.push(value); }
});

test("clean video passes scanning and queues transcoding", async () => {
  const store = new InMemoryMediaJobStore({ jobs: [{ ...malwareJob }], assets: [{ ...asset }] });
  const worker = new MediaWorker({ store, objectStorage: storage(), scanner: { async scanFile() { return { clean: true, output: "OK" }; } }, videoProcessor: {}, workerId: "worker-1" });
  assert.equal(await worker.processNext(), true);
  assert.equal(store.jobs[0].status, "completed");
  assert.equal(store.jobs[1].jobType, "video_transcode");
  assert.ok(store.assets.get(asset.id).scannedAt);
});

test("infected upload is rejected and never queued for video", async () => {
  const store = new InMemoryMediaJobStore({ jobs: [{ ...malwareJob }], assets: [{ ...asset }] });
  const worker = new MediaWorker({ store, objectStorage: storage(), scanner: { async scanFile() { return { clean: false, output: "Eicar-Test-Signature FOUND" }; } }, videoProcessor: {}, workerId: "worker-1" });
  await worker.processNext();
  assert.equal(store.assets.get(asset.id).status, "rejected");
  assert.equal(store.jobs.length, 1);
  assert.equal(store.auditEvents[0].action, "asset.malware_detected");
});

test("video job uploads renditions and marks the asset ready", async () => {
  const job = { ...malwareJob, id: "job-2", jobType: "video_transcode" };
  const store = new InMemoryMediaJobStore({ jobs: [job], assets: [{ ...asset }] });
  const objectStorage = storage();
  const videoProcessor = { async process({ videoPath, thumbnailPath }) { return {
    metadata: { width: 1920, height: 1080, durationSeconds: 12 },
    renditions: [
      { kind: "web_mp4", filePath: videoPath, mimeType: "video/mp4", sizeBytes: 2048, width: 1920, height: 1080, durationSeconds: 12 },
      { kind: "thumbnail", filePath: thumbnailPath, mimeType: "image/jpeg", sizeBytes: 256, width: 1280, height: 720, durationSeconds: null }
    ]
  }; } };
  const worker = new MediaWorker({ store, objectStorage, scanner: {}, videoProcessor, workerId: "worker-1" });
  await worker.processNext();
  assert.equal(store.assets.get(asset.id).status, "ready");
  assert.equal(objectStorage.uploads.length, 2);
  assert.deepEqual(store.renditions.map((item) => item.kind), ["web_mp4", "thumbnail"]);
});

test("processing failure is retained for retry", async () => {
  const store = new InMemoryMediaJobStore({ jobs: [{ ...malwareJob }], assets: [{ ...asset }] });
  const worker = new MediaWorker({ store, objectStorage: storage(), scanner: { async scanFile() { throw new Error("scanner unavailable"); } }, videoProcessor: {}, workerId: "worker-1" });
  await worker.processNext();
  assert.equal(store.jobs[0].status, "failed");
  assert.equal(store.jobs[0].lastError, "scanner unavailable");
  assert.equal(store.assets.get(asset.id).status, "queued");
});
