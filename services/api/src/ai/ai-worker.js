export class AiWorker {
  constructor({ store, objectStorage, provider, workerId, reviewThreshold = 0.75, clock = () => Date.now() }) {
    Object.assign(this, { store, objectStorage, provider, workerId, reviewThreshold, clock });
  }
  async processNext() {
    const job = await this.store.claimNext(this.workerId);
    if (!job) return false;
    const descriptor = this.provider.descriptor();
    const run = await this.store.startRun({ job, ...descriptor });
    const startedAt = this.clock();
    try {
      const asset = await this.store.getAsset(job.organizationId, job.assetId);
      if (!asset) throw new Error("The AI job asset no longer exists.");
      const sourceUrl = await this.objectStorage.createDownloadUrl(asset.storageKey);
      const enrichment = await this.provider.enrich({ assetId: asset.id, organizationId: asset.organizationId, sourceUrl, mimeType: asset.mimeType });
      const results = [
        { kind: "transcript", content: { text: enrichment.transcript.text, language: enrichment.transcript.language }, confidence: enrichment.transcript.confidence },
        { kind: "summary", content: { text: enrichment.summary.text }, confidence: enrichment.summary.confidence },
        { kind: "tags", content: { items: enrichment.tags.items }, confidence: enrichment.tags.confidence },
        { kind: "moderation", content: { flagged: enrichment.moderation.flagged, categories: enrichment.moderation.categories }, confidence: enrichment.moderation.confidence }
      ].map((result) => ({ ...result, needsReview: (result.kind === "moderation" && enrichment.moderation.flagged) || result.confidence == null || result.confidence < this.reviewThreshold }));
      await this.store.completeRun({ job, run, results, usage: enrichment.usage, latencyMs: this.clock() - startedAt });
      return true;
    } catch (error) {
      await this.store.failRun({ job, run, error });
      return true;
    }
  }
}
