import { randomUUID } from "node:crypto";

export class InMemoryAssetStore {
  constructor() { this.assets = new Map(); this.jobs = []; this.auditEvents = []; }
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
