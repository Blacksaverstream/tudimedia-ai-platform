import { randomUUID } from "node:crypto";
import { AuthError } from "../auth/errors.js";
import { requirePermission } from "../auth/roles.js";

const allowedMediaTypes = ["video/", "audio/", "image/"];
const safeFilename = (value) => String(value ?? "").normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-160);

export class UploadService {
  constructor({ store, objectStorage, maxSizeBytes = 5 * 1024 * 1024 * 1024 }) {
    this.store = store;
    this.objectStorage = objectStorage;
    this.maxSizeBytes = maxSizeBytes;
  }
  async createUploadIntent({ actor, name, filename, mimeType, sizeBytes, checksumSha256 = null }) {
    requirePermission(actor.role, "assets:write");
    const cleanName = String(name ?? "").trim();
    const cleanFilename = safeFilename(filename);
    const numericSize = Number(sizeBytes);
    if (!cleanName || cleanName.length > 200 || !cleanFilename || !allowedMediaTypes.some((prefix) => String(mimeType).startsWith(prefix))) {
      throw new AuthError("ASSET_VALIDATION", "A valid name, filename, and supported media type are required.", 422);
    }
    if (!Number.isSafeInteger(numericSize) || numericSize < 1 || numericSize > this.maxSizeBytes) {
      throw new AuthError("ASSET_SIZE_INVALID", `Asset size must be between 1 and ${this.maxSizeBytes} bytes.`, 422);
    }
    if (checksumSha256 && !/^[A-Za-z0-9_-]{43}=$/.test(checksumSha256) && !/^[A-Fa-f0-9]{64}$/.test(checksumSha256)) {
      throw new AuthError("ASSET_CHECKSUM_INVALID", "The SHA-256 checksum is invalid.", 422);
    }
    const id = randomUUID();
    const storageKey = `${actor.organizationId}/${id}/source/${cleanFilename}`;
    const asset = await this.store.transaction(async (store) => {
      const created = await store.createAsset({ id, organizationId: actor.organizationId, createdByUserId: actor.userId, name: cleanName, originalFilename: cleanFilename, storageKey, mimeType, sizeBytes: numericSize, checksumSha256 });
      await store.appendAudit({ organizationId: actor.organizationId, actorUserId: actor.userId, sessionId: actor.sessionId, action: "asset.upload_intent_created", metadata: { assetId: id, mimeType, sizeBytes: numericSize } });
      return created;
    });
    const uploadUrl = await this.objectStorage.createUploadUrl({ key: storageKey, mimeType, sizeBytes: numericSize, checksumSha256 });
    return { asset, upload: { method: "PUT", url: uploadUrl, expiresInSeconds: 900, headers: { "content-type": mimeType } } };
  }
  async completeUpload({ actor, assetId }) {
    requirePermission(actor.role, "assets:write");
    const asset = await this.store.getAsset(actor.organizationId, assetId);
    if (!asset) throw new AuthError("ASSET_NOT_FOUND", "Asset not found.", 404);
    if (asset.status !== "awaiting_upload") throw new AuthError("ASSET_STATE_INVALID", "This upload has already been completed.", 409);
    const object = await this.objectStorage.inspectObject(asset.storageKey);
    const valid = object && Number(object.sizeBytes) === Number(asset.sizeBytes) && object.mimeType === asset.mimeType && (!asset.checksumSha256 || object.checksumSha256 === asset.checksumSha256);
    if (!valid) {
      await this.store.transaction(async (store) => {
        await store.updateAssetStatus({ organizationId: actor.organizationId, id: assetId, status: "rejected", rejectionReason: "Uploaded object metadata did not match the upload intent." });
        await store.appendAudit({ organizationId: actor.organizationId, actorUserId: actor.userId, sessionId: actor.sessionId, action: "asset.upload_rejected", metadata: { assetId } });
      });
      throw new AuthError("ASSET_UPLOAD_MISMATCH", "The uploaded object does not match the declared file.", 422);
    }
    return this.store.transaction(async (store) => {
      const updated = await store.updateAssetStatus({ organizationId: actor.organizationId, id: assetId, status: "queued" });
      const job = await store.createJob({ organizationId: actor.organizationId, assetId, jobType: "malware_scan" });
      await store.appendAudit({ organizationId: actor.organizationId, actorUserId: actor.userId, sessionId: actor.sessionId, action: "asset.upload_completed", metadata: { assetId, jobId: job?.id } });
      return { asset: updated, job };
    });
  }
  async getAsset({ actor, assetId }) {
    requirePermission(actor.role, "assets:read");
    const asset = await this.store.getAsset(actor.organizationId, assetId);
    if (!asset) throw new AuthError("ASSET_NOT_FOUND", "Asset not found.", 404);
    return asset;
  }
}
