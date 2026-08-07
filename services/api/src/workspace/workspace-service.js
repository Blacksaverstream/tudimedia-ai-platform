import { randomUUID } from "node:crypto";
import { AuthError } from "../auth/errors.js";
import { requirePermission } from "../auth/roles.js";

const encodeCursor = (asset) => Buffer.from(JSON.stringify([asset.createdAt.toISOString(), asset.id])).toString("base64url");
const decodeCursor = (cursor) => {
  if (!cursor) return {};
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!createdAt || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(Date.parse(createdAt))) throw new Error();
    return { beforeCreatedAt: new Date(createdAt), beforeId: id };
  } catch { throw new AuthError("PAGINATION_CURSOR_INVALID", "The pagination cursor is invalid.", 422); }
};

export class WorkspaceService {
  constructor({ store }) { this.store = store; }
  async listAssets({ actor, cursor, limit = 24, status, mediaType }) {
    requirePermission(actor.role, "assets:read");
    const pageSize = Number(limit);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new AuthError("ASSET_LIST_INVALID", "Limit must be between 1 and 100.", 422);
    if (status && !["awaiting_upload", "queued", "processing", "ready", "rejected", "failed"].includes(status)) throw new AuthError("ASSET_LIST_INVALID", "Asset status is invalid.", 422);
    if (mediaType && !["video", "audio", "image"].includes(mediaType)) throw new AuthError("ASSET_LIST_INVALID", "Media type is invalid.", 422);
    const items = await this.store.listAssets({ organizationId: actor.organizationId, ...decodeCursor(cursor), limit: pageSize + 1, status, mediaType });
    const hasMore = items.length > pageSize;
    const visible = items.slice(0, pageSize);
    return { items: visible, nextCursor: hasMore ? encodeCursor(visible.at(-1)) : null };
  }
  async dashboard({ actor }) { requirePermission(actor.role, "assets:read"); return this.store.getDashboard(actor.organizationId); }
  async listCollections({ actor }) { requirePermission(actor.role, "assets:read"); return this.store.listCollections(actor.organizationId); }
  async createCollection({ actor, name, description = "" }) {
    requirePermission(actor.role, "assets:write");
    const cleanName = String(name ?? "").trim(); const cleanDescription = String(description ?? "").trim();
    if (!cleanName || cleanName.length > 120 || cleanDescription.length > 1000) throw new AuthError("COLLECTION_VALIDATION", "Collection name or description is invalid.", 422);
    const collection = await this.store.createCollection({ id: randomUUID(), organizationId: actor.organizationId, createdByUserId: actor.userId, name: cleanName, description: cleanDescription });
    await this.store.appendAudit({ organizationId: actor.organizationId, actorUserId: actor.userId, sessionId: actor.sessionId, action: "collection.created", metadata: { collectionId: collection.id } });
    return collection;
  }
  async addCollectionAsset({ actor, collectionId, assetId }) {
    requirePermission(actor.role, "assets:write");
    const asset = await this.store.getAsset(actor.organizationId, assetId);
    if (!asset) throw new AuthError("ASSET_NOT_FOUND", "Asset not found.", 404);
    const collection = await this.store.getCollection(actor.organizationId, collectionId);
    if (!collection) throw new AuthError("COLLECTION_NOT_FOUND", "Collection not found.", 404);
    const added = await this.store.addCollectionAsset({ collectionId, assetId, addedByUserId: actor.userId });
    await this.store.appendAudit({ organizationId: actor.organizationId, actorUserId: actor.userId, sessionId: actor.sessionId, action: "collection.asset_added", metadata: { collectionId, assetId } });
    return { collectionId, assetId, added };
  }
}
