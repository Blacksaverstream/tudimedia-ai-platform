export class InMemoryOperationsStore {
  constructor() { this.subscriptions = new Map(); this.usage = new Map(); this.notifications = new Map(); this.jobs = new Map(); }
  async getSubscription(organizationId) { return this.subscriptions.get(organizationId) ?? null; }
  async upsertSubscription(value) { const record = { ...value, updatedAt: new Date() }; this.subscriptions.set(value.organizationId, record); return record; }
  async recordUsage(value) { const key = `${value.organizationId}:${value.idempotencyKey}`; if (this.usage.has(key)) return this.usage.get(key); this.usage.set(key, value); return value; }
  async createNotification(value) { this.notifications.set(value.id, value); return value; }
  async listNotifications(organizationId, userId) { return [...this.notifications.values()].filter((item) => item.organizationId === organizationId && item.userId === userId).sort((a,b)=>b.createdAt-a.createdAt); }
  async markNotificationRead(organizationId, userId, id, readAt) { const item = this.notifications.get(id); if (!item || item.organizationId !== organizationId || item.userId !== userId) return null; item.readAt = readAt; return item; }
  async createJob(value) { const existing = [...this.jobs.values()].find((item) => item.organizationId === value.organizationId && item.idempotencyKey === value.idempotencyKey); if (existing) return existing; this.jobs.set(value.id, value); return value; }
  async getJob(organizationId, id) { const job = this.jobs.get(id); return job?.organizationId === organizationId ? job : null; }
  async listJobs(organizationId, limit = 100) { return [...this.jobs.values()].filter((job)=>job.organizationId===organizationId).sort((a,b)=>b.createdAt-a.createdAt).slice(0,limit); }
  async cancelJob(organizationId, id, updatedAt) { const job=await this.getJob(organizationId,id); if(!job || !["queued","failed"].includes(job.status)) return null; job.status="canceled";job.updatedAt=updatedAt;return job; }
}
