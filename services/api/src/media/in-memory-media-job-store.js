export class InMemoryMediaJobStore {
  constructor({ jobs = [], assets = [] } = {}) {
    this.jobs = jobs;
    this.assets = new Map(assets.map((asset) => [asset.id, asset]));
    this.renditions = [];
    this.auditEvents = [];
  }
  async claimNext(workerId) {
    const job = this.jobs.find((item) => ["queued", "failed"].includes(item.status) && (item.attempts ?? 0) < 5);
    if (!job) return null;
    Object.assign(job, { status: "processing", attempts: (job.attempts ?? 0) + 1, workerId });
    const asset = this.assets.get(job.assetId);
    if (asset) asset.status = "processing";
    return job;
  }
  async getAsset(organizationId, assetId) { const asset = this.assets.get(assetId); return asset?.organizationId === organizationId ? asset : null; }
  async completeMalwareScan({ job, clean, output }) {
    const asset = this.assets.get(job.assetId);
    if (clean) {
      asset.scannedAt = new Date();
      if (asset.mimeType.startsWith("video/")) this.jobs.push({ id: `video-${job.assetId}`, organizationId: job.organizationId, assetId: job.assetId, jobType: "video_transcode", status: "queued", attempts: 0 });
      else asset.status = "ready";
    } else { asset.status = "rejected"; asset.rejectionReason = "Malware scan detected unsafe content."; }
    job.status = "completed";
    this.auditEvents.push({ action: clean ? "asset.malware_scan_passed" : "asset.malware_detected", output });
  }
  async completeVideo({ job, metadata, renditions }) {
    const asset = this.assets.get(job.assetId);
    asset.status = "ready"; asset.technicalMetadata = metadata;
    this.renditions.push(...renditions); job.status = "completed";
    this.auditEvents.push({ action: "asset.video_processed" });
  }
  async failJob(job, error) {
    job.status = "failed"; job.lastError = error.message;
    this.assets.get(job.assetId).status = job.attempts >= 5 ? "failed" : "queued";
    this.auditEvents.push({ action: "asset.processing_failed" });
  }
}
