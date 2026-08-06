import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "../src/auth/errors.js";
import { InMemoryAssetStore } from "../src/assets/in-memory-asset-store.js";
import { InMemoryObjectStorage } from "../src/assets/object-storage.js";
import { UploadService } from "../src/assets/upload-service.js";

const actor = { userId: "user-1", organizationId: "org-1", role: "editor", sessionId: "session-1" };
const setup = () => {
  const store = new InMemoryAssetStore();
  const objectStorage = new InMemoryObjectStorage();
  return { store, objectStorage, uploads: new UploadService({ store, objectStorage }) };
};

test("creates a tenant-scoped signed upload intent", async () => {
  const { store, uploads } = setup();
  const result = await uploads.createUploadIntent({ actor, name: "Launch film", filename: "launch film.mp4", mimeType: "video/mp4", sizeBytes: 1024 });
  assert.equal(result.asset.organizationId, actor.organizationId);
  assert.match(result.asset.storageKey, /^org-1\/.+\/source\/launch-film\.mp4$/);
  assert.match(result.upload.url, /^memory:\/\/upload\//);
  assert.equal(store.auditEvents[0].action, "asset.upload_intent_created");
});

test("viewer cannot create an upload", async () => {
  const { uploads } = setup();
  await assert.rejects(
    () => uploads.createUploadIntent({ actor: { ...actor, role: "viewer" }, name: "Film", filename: "film.mp4", mimeType: "video/mp4", sizeBytes: 1024 }),
    (error) => error instanceof AuthError && error.code === "AUTH_FORBIDDEN"
  );
});

test("verified upload is queued for malware scanning", async () => {
  const { store, objectStorage, uploads } = setup();
  const intent = await uploads.createUploadIntent({ actor, name: "Launch film", filename: "launch.mp4", mimeType: "video/mp4", sizeBytes: 1024 });
  objectStorage.putObject(intent.asset.storageKey, { sizeBytes: 1024, mimeType: "video/mp4", checksumSha256: null });
  const result = await uploads.completeUpload({ actor, assetId: intent.asset.id });
  assert.equal(result.asset.status, "queued");
  assert.equal(result.job.jobType, "malware_scan");
  assert.equal(store.auditEvents.at(-1).action, "asset.upload_completed");
});

test("mismatched object is rejected", async () => {
  const { store, objectStorage, uploads } = setup();
  const intent = await uploads.createUploadIntent({ actor, name: "Launch film", filename: "launch.mp4", mimeType: "video/mp4", sizeBytes: 1024 });
  objectStorage.putObject(intent.asset.storageKey, { sizeBytes: 99, mimeType: "video/mp4", checksumSha256: null });
  await assert.rejects(() => uploads.completeUpload({ actor, assetId: intent.asset.id }), (error) => error instanceof AuthError && error.code === "ASSET_UPLOAD_MISMATCH");
  assert.equal((await store.getAsset(actor.organizationId, intent.asset.id)).status, "rejected");
});
