import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "../src/auth/errors.js";
import { InMemorySearchStore } from "../src/search/in-memory-search-store.js";
import { SearchService } from "../src/search/search-service.js";

const actor = { userId: "user-1", organizationId: "org-1", role: "viewer" };
const documents = [
  { id: "asset-1", organizationId: "org-1", name: "Launch interview", summary: "Product launch discussion", transcript: "The new camera launches Friday", tags: ["launch", "camera"], mimeType: "video/mp4", status: "ready", createdAt: "2026-08-06T10:00:00Z" },
  { id: "asset-2", organizationId: "org-1", name: "Studio photo", summary: "Portrait", transcript: "", tags: ["portrait"], mimeType: "image/jpeg", status: "ready", createdAt: "2026-08-05T10:00:00Z" },
  { id: "asset-3", organizationId: "org-2", name: "Private launch", summary: "Other tenant", transcript: "camera launch", tags: ["launch"], mimeType: "video/mp4", status: "ready", createdAt: "2026-08-07T10:00:00Z" },
  { id: "asset-4", organizationId: "org-1", name: "Unsafe upload", summary: "", transcript: "camera", tags: [], mimeType: "video/mp4", status: "rejected", createdAt: "2026-08-08T10:00:00Z" }
];
const search = new SearchService({ store: new InMemorySearchStore(documents) });

test("search is tenant-scoped and excludes unavailable assets", async () => {
  const result = await search.search({ actor, query: "camera launch" });
  assert.deepEqual(result.items.map((item) => item.id), ["asset-1"]);
});

test("metadata and tag filters narrow results", async () => {
  const video = await search.search({ actor, filters: { mediaType: "video", tags: ["LAUNCH"] } });
  assert.deepEqual(video.items.map((item) => item.id), ["asset-1"]);
  const image = await search.search({ actor, filters: { mediaType: "image" } });
  assert.deepEqual(image.items.map((item) => item.id), ["asset-2"]);
});

test("cursor pagination returns the next page", async () => {
  const first = await search.search({ actor, limit: 1 });
  assert.ok(first.nextCursor);
  const second = await search.search({ actor, limit: 1, cursor: first.nextCursor });
  assert.notEqual(first.items[0].id, second.items[0].id);
});

test("invalid search inputs are rejected", async () => {
  await assert.rejects(() => search.search({ actor, limit: 101 }), (error) => error instanceof AuthError && error.code === "SEARCH_LIMIT_INVALID");
  await assert.rejects(() => search.search({ actor, cursor: "not-a-cursor" }), (error) => error instanceof AuthError && error.code === "SEARCH_CURSOR_INVALID");
  await assert.rejects(() => search.search({ actor, filters: { mediaType: "document" } }), (error) => error instanceof AuthError && error.code === "SEARCH_FILTER_INVALID");
});
