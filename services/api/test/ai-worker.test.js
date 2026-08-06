import test from "node:test";
import assert from "node:assert/strict";
import { AiWorker } from "../src/ai/ai-worker.js";
import { validateEnrichment } from "../src/ai/http-ai-provider.js";
import { InMemoryAiStore } from "../src/ai/in-memory-ai-store.js";

const asset = { id: "asset-1", organizationId: "org-1", storageKey: "org-1/asset-1/renditions/web.mp4", mimeType: "video/mp4" };
const job = { id: "ai-job-1", organizationId: "org-1", assetId: "asset-1", jobType: "ai_enrich", status: "queued", attempts: 0 };
const enrichment = {
  transcript: { text: "A product launch interview.", language: "en", confidence: 0.94 },
  summary: { text: "The team discusses the launch.", confidence: 0.91 },
  tags: { items: ["launch", "interview"], confidence: 0.87 },
  moderation: { flagged: false, categories: [], confidence: 0.99 },
  usage: { inputUnits: 100, outputUnits: 25, costMicros: 3200 }
};
const setup = (providerResult = enrichment) => {
  const store = new InMemoryAiStore({ jobs: [{ ...job }], assets: [{ ...asset }] });
  const provider = { descriptor: () => ({ provider: "test", model: "media-1", promptVersion: "v1" }), async enrich() { if (providerResult instanceof Error) throw providerResult; return providerResult; } };
  const objectStorage = { async createDownloadUrl(key) { return `https://storage.test/${key}`; } };
  return { store, worker: new AiWorker({ store, provider, objectStorage, workerId: "worker-1", clock: (() => { let now = 1000; return () => (now += 25); })() }) };
};

test("AI enrichment stores governed current results and usage", async () => {
  const { store, worker } = setup();
  await worker.processNext();
  assert.equal(store.jobs[0].status, "completed");
  assert.deepEqual(store.results.map((item) => item.kind), ["transcript", "summary", "tags", "moderation"]);
  assert.equal(store.runs[0].usage.costMicros, 3200);
  assert.equal(store.auditEvents[0].action, "asset.ai_enrichment_completed");
});

test("flagged moderation and low-confidence results create review tasks", async () => {
  const result = structuredClone(enrichment);
  result.summary.confidence = 0.4;
  result.moderation.flagged = true;
  result.moderation.categories = ["violence"];
  const { store, worker } = setup(result);
  await worker.processNext();
  assert.equal(store.reviews.length, 2);
  assert.deepEqual(store.results.filter((item) => item.needsReview).map((item) => item.kind), ["summary", "moderation"]);
});

test("provider failure is recorded and remains retryable", async () => {
  const { store, worker } = setup(new Error("provider unavailable"));
  await worker.processNext();
  assert.equal(store.jobs[0].status, "failed");
  assert.equal(store.runs[0].status, "failed");
  assert.equal(store.jobs[0].lastError, "provider unavailable");
});

test("provider responses are bounded and validated", () => {
  assert.throws(() => validateEnrichment({ transcript: {}, summary: {} }), /failed validation/);
  const validated = validateEnrichment(enrichment);
  assert.equal(validated.tags.items.length, 2);
  assert.equal(validated.transcript.language, "en");
});
