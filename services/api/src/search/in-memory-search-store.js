export class InMemorySearchStore {
  constructor(documents = []) { this.documents = documents; }
  async search({ organizationId, query, mediaType, tags, limit, offset }) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.documents
      .filter((item) => item.organizationId === organizationId && item.status === "ready")
      .filter((item) => !mediaType || item.mimeType.startsWith(`${mediaType}/`))
      .filter((item) => tags.every((tag) => item.tags.includes(tag)))
      .map((item) => {
        const text = `${item.name} ${item.summary ?? ""} ${(item.tags ?? []).join(" ")} ${item.transcript ?? ""}`.toLowerCase();
        return { ...item, rank: terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0), headline: item.summary ?? "" };
      })
      .filter((item) => !terms.length || item.rank === terms.length)
      .sort((a, b) => b.rank - a.rank || new Date(b.createdAt) - new Date(a.createdAt))
      .slice(offset, offset + limit);
  }
}
