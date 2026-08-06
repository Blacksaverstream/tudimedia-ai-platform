export class HttpAiProvider {
  constructor({ endpoint, apiKey, provider, model, promptVersion, timeoutMs = 10 * 60 * 1000 }) {
    if (!endpoint || !apiKey || !provider || !model || !promptVersion) throw new Error("AI provider configuration is incomplete.");
    Object.assign(this, { endpoint: endpoint.replace(/\/$/, ""), apiKey, provider, model, promptVersion, timeoutMs });
  }
  descriptor() { return { provider: this.provider, model: this.model, promptVersion: this.promptVersion }; }
  async enrich({ assetId, organizationId, sourceUrl, mimeType }) {
    const response = await fetch(`${this.endpoint}/v1/media/enrich`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ assetId, organizationId, sourceUrl, mimeType, model: this.model, promptVersion: this.promptVersion, tasks: ["transcript", "summary", "tags", "moderation"] }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);
    return validateEnrichment(await response.json());
  }
}

export function validateEnrichment(value) {
  if (!value || typeof value !== "object") throw new Error("AI provider response must be an object.");
  const confidence = (input) => input == null ? null : Number(input);
  const validConfidence = (input) => input == null || (Number.isFinite(input) && input >= 0 && input <= 1);
  const transcript = { text: String(value.transcript?.text ?? "").slice(0, 2_000_000), language: String(value.transcript?.language ?? "und").slice(0, 16), confidence: confidence(value.transcript?.confidence) };
  const summary = { text: String(value.summary?.text ?? "").slice(0, 20_000), confidence: confidence(value.summary?.confidence) };
  const tags = { items: Array.isArray(value.tags?.items) ? value.tags.items.slice(0, 100).map((item) => String(item).slice(0, 100)) : [], confidence: confidence(value.tags?.confidence) };
  const moderation = { flagged: Boolean(value.moderation?.flagged), categories: Array.isArray(value.moderation?.categories) ? value.moderation.categories.slice(0, 50).map(String) : [], confidence: confidence(value.moderation?.confidence) };
  if (!transcript.text || !summary.text || !validConfidence(transcript.confidence) || !validConfidence(summary.confidence) || !validConfidence(tags.confidence) || !validConfidence(moderation.confidence)) throw new Error("AI provider response failed validation.");
  const usage = { inputUnits: Number(value.usage?.inputUnits ?? 0), outputUnits: Number(value.usage?.outputUnits ?? 0), costMicros: Number(value.usage?.costMicros ?? 0) };
  if (Object.values(usage).some((item) => !Number.isFinite(item) || item < 0)) throw new Error("AI provider usage failed validation.");
  return { transcript, summary, tags, moderation, usage };
}
