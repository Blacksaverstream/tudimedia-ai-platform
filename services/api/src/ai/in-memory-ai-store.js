import { randomUUID } from "node:crypto";

export class InMemoryAiStore {
  constructor({ jobs = [], assets = [] } = {}) {
    this.jobs = jobs; this.assets = new Map(assets.map((asset) => [asset.id, asset])); this.runs = []; this.results = []; this.reviews = []; this.auditEvents = [];
  }
  async claimNext(workerId) {
    const job = this.jobs.find((item) => item.jobType === "ai_enrich" && ["queued", "failed"].includes(item.status) && (item.attempts ?? 0) < 5);
    if (!job) return null;
    Object.assign(job, { status: "processing", attempts: (job.attempts ?? 0) + 1, workerId }); return job;
  }
  async getAsset(organizationId, assetId) { const asset = this.assets.get(assetId); return asset?.organizationId === organizationId ? asset : null; }
  async startRun({ job, provider, model, promptVersion }) {
    const run = { id: randomUUID(), organizationId: job.organizationId, assetId: job.assetId, provider, model, promptVersion, status: "running" }; this.runs.push(run); return run;
  }
  async completeRun({ job, run, results, usage, latencyMs }) {
    for (const result of results) {
      this.results.filter((item) => item.assetId === job.assetId && item.kind === result.kind).forEach((item) => { item.isCurrent = false; });
      const stored = { id: randomUUID(), assetId: job.assetId, modelRunId: run.id, isCurrent: true, ...result }; this.results.push(stored);
      if (result.needsReview) this.reviews.push({ id: randomUUID(), assetId: job.assetId, resultId: stored.id, status: "pending" });
    }
    Object.assign(run, { status: "completed", usage, latencyMs }); job.status = "completed"; this.auditEvents.push({ action: "asset.ai_enrichment_completed" });
  }
  async failRun({ job, run, error }) { run.status = "failed"; run.errorMessage = error.message; job.status = "failed"; job.lastError = error.message; this.auditEvents.push({ action: "asset.ai_enrichment_failed" }); }
}
