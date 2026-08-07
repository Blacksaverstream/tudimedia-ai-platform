import { randomUUID } from "node:crypto";

export class InMemoryAssetStore {
  constructor() { this.assets = new Map(); this.jobs = []; this.auditEvents = []; this.collections = new Map(); this.collectionAssets = new Set(); }
  async transaction(work) { return work(this); }
  async createAsset(asset) {
    const record = { status: "awaiting_upload", rejectionReason: null, createdAt: new Date(), updatedAt: new Date(), ...asset };
    this.assets.set(record.id, record);
    return record;
  }
  async getAsset(organizationId, id) {
    const asset = this.assets.get(id);
    return asset?.organizationId === organizationId ? asset : null;
  }
  async listAssets({ organizationId, beforeCreatedAt, beforeId, limit, status, mediaType }) {
    return [...this.assets.values()].filter((asset) => asset.organizationId === organizationId)
      .filter((asset) => !status || asset.status === status).filter((asset) => !mediaType || asset.mimeType.startsWith(`${mediaType}/`))
      .filter((asset) => !beforeCreatedAt || asset.createdAt < beforeCreatedAt || (asset.createdAt.getTime() === beforeCreatedAt.getTime() && asset.id < beforeId))
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)).slice(0, limit);
  }
  async getDashboard(organizationId) {
    const assets = [...this.assets.values()].filter((asset) => asset.organizationId === organizationId);
    return { assetCount: assets.length, readyCount: assets.filter((asset) => asset.status === "ready").length, processingCount: assets.filter((asset) => ["queued", "processing"].includes(asset.status)).length, storageBytes: String(assets.reduce((sum, asset) => sum + Number(asset.sizeBytes), 0)) };
  }
  async createCollection(collection) { const record = { ...collection, createdAt: new Date(), updatedAt: new Date() }; this.collections.set(record.id, record); return record; }
  async getCollection(organizationId, id) { const item = this.collections.get(id); return item?.organizationId === organizationId ? item : null; }
  async listCollections(organizationId) { return [...this.collections.values()].filter((item) => item.organizationId === organizationId); }
  async addCollectionAsset({ collectionId, assetId }) { const key = `${collectionId}:${assetId}`; const added = !this.collectionAssets.has(key); this.collectionAssets.add(key); return added; }
  async updateAssetStatus({ organizationId, id, status, rejectionReason = null }) {
    const asset = await this.getAsset(organizationId, id);
    if (!asset) return null;
    Object.assign(asset, { status, rejectionReason, updatedAt: new Date() });
    return asset;
  }
  async createJob(job) {
    if (this.jobs.some((item) => item.assetId === job.assetId && item.jobType === job.jobType)) return null;
    const record = { id: randomUUID(), status: "queued", attempts: 0, createdAt: new Date(), ...job };
    this.jobs.push(record);
    return record;
  }
  async getCurrentEnrichments() { return []; }
  async appendAudit(event) { this.auditEvents.push({ id: randomUUID(), occurredAt: new Date(), ...event }); }
}
