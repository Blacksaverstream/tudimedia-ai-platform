import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAssetStore } from "../src/assets/in-memory-asset-store.js";
import { WorkspaceService } from "../src/workspace/workspace-service.js";

const actor = { userId: "10000000-0000-4000-8000-000000000001", organizationId: "20000000-0000-4000-8000-000000000001", sessionId: "30000000-0000-4000-8000-000000000001", role: "owner" };
const create = async () => { const store = new InMemoryAssetStore(); const service = new WorkspaceService({ store }); return { store, service }; };
const asset = (id, createdAt, overrides = {}) => ({ id, organizationId: actor.organizationId, createdByUserId: actor.userId, name: `Asset ${id}`, originalFilename: "asset.mp4", storageKey: `key-${id}`, mimeType: "video/mp4", sizeBytes: 100, status: "ready", createdAt, updatedAt: createdAt, ...overrides });

test("asset listing is tenant scoped, filtered, and cursor paginated", async () => {
  const { store, service } = await create();
  await store.createAsset(asset("40000000-0000-4000-8000-000000000001", new Date("2026-08-07T12:00:00Z")));
  await store.createAsset(asset("40000000-0000-4000-8000-000000000002", new Date("2026-08-07T11:00:00Z"), { mimeType: "audio/mpeg" }));
  await store.createAsset(asset("40000000-0000-4000-8000-000000000003", new Date("2026-08-07T10:00:00Z")));
  await store.createAsset(asset("40000000-0000-4000-8000-000000000004", new Date(), { organizationId: "other" }));
  const first = await service.listAssets({ actor, limit: 1 });
  const second = await service.listAssets({ actor, limit: 1, cursor: first.nextCursor });
  assert.equal(first.items.length, 1); assert.equal(second.items[0].mimeType, "audio/mpeg");
  assert.equal((await service.listAssets({ actor, mediaType: "video" })).items.length, 2);
});

test("dashboard returns tenant totals", async () => {
  const { store, service } = await create();
  await store.createAsset(asset("40000000-0000-4000-8000-000000000001", new Date(), { sizeBytes: 250 }));
  await store.createAsset(asset("40000000-0000-4000-8000-000000000002", new Date(), { sizeBytes: 50, status: "processing" }));
  assert.deepEqual(await service.dashboard({ actor }), { assetCount: 2, readyCount: 1, processingCount: 1, storageBytes: "300" });
});

test("collections are tenant scoped and accept authorized assets", async () => {
  const { store, service } = await create();
  const item = await store.createAsset(asset("40000000-0000-4000-8000-000000000001", new Date()));
  const collection = await service.createCollection({ actor, name: "Launch selects", description: "Approved moments" });
  const result = await service.addCollectionAsset({ actor, collectionId: collection.id, assetId: item.id });
  assert.equal(result.added, true); assert.equal((await service.listCollections({ actor })).length, 1);
  assert.deepEqual(store.auditEvents.map((event) => event.action), ["collection.created", "collection.asset_added"]);
});
