export class InMemoryOperationsStore {
  constructor() { this.subscriptions = new Map(); this.usage = new Map(); this.notifications = new Map(); this.jobs = new Map(); this.billingEvents = new Set(); this.deliveries = new Map(); }
  async getSubscription(organizationId) { return this.subscriptions.get(organizationId) ?? null; }
  async upsertSubscription(value) { const record = { ...value, updatedAt: new Date() }; this.subscriptions.set(value.organizationId, record); return record; }
  async recordUsage(value) { const key = `${value.organizationId}:${value.idempotencyKey}`; if (this.usage.has(key)) return this.usage.get(key); this.usage.set(key, value); return value; }
  async createNotification(value) { this.notifications.set(value.id, value); const delivery={id:`delivery-${value.id}`,notificationId:value.id,channel:"in_app",destination:value.userId,status:"queued",attempts:0,availableAt:value.createdAt,title:value.title,body:value.body};this.deliveries.set(delivery.id,delivery);return value; }
  async listNotifications(organizationId, userId) { return [...this.notifications.values()].filter((item) => item.organizationId === organizationId && item.userId === userId).sort((a,b)=>b.createdAt-a.createdAt); }
  async markNotificationRead(organizationId, userId, id, readAt) { const item = this.notifications.get(id); if (!item || item.organizationId !== organizationId || item.userId !== userId) return null; item.readAt = readAt; return item; }
  async createJob(value) { const existing = [...this.jobs.values()].find((item) => item.organizationId === value.organizationId && item.idempotencyKey === value.idempotencyKey); if (existing) return existing; this.jobs.set(value.id, value); return value; }
  async getJob(organizationId, id) { const job = this.jobs.get(id); return job?.organizationId === organizationId ? job : null; }
  async listJobs(organizationId, limit = 100) { return [...this.jobs.values()].filter((job)=>job.organizationId===organizationId).sort((a,b)=>b.createdAt-a.createdAt).slice(0,limit); }
  async cancelJob(organizationId, id, updatedAt) { const job=await this.getJob(organizationId,id); if(!job || !["queued","failed"].includes(job.status)) return null; job.status="canceled";job.updatedAt=updatedAt;return job; }
  async processBillingEvent(event) { if(this.billingEvents.has(event.id)) return {duplicate:true};this.billingEvents.add(event.id);await this.upsertSubscription({organizationId:event.organizationId,planCode:event.planCode,status:event.status,provider:event.provider,providerCustomerId:event.providerCustomerId,providerSubscriptionId:event.providerSubscriptionId,currentPeriodEnd:event.currentPeriodEnd});return{duplicate:false}; }
  async claimJob({now}) { const job=[...this.jobs.values()].find((item)=>["queued","failed"].includes(item.status)&&(item.availableAt??item.createdAt)<=now&&item.attempts<5);if(!job)return null;job.status="processing";job.attempts+=1;return job; }
  async completeJob({id,output,now}) { const job=this.jobs.get(id);Object.assign(job,{status:"completed",output,updatedAt:now}); }
  async failJob({id,error,now}) { const job=this.jobs.get(id);Object.assign(job,{status:job.attempts>=5?"failed":"failed",lastError:error,availableAt:new Date(now.getTime()+Math.min(300,2**job.attempts)*1000),updatedAt:now}); }
  async claimDelivery({now}) { const item=[...this.deliveries.values()].find((value)=>["queued","failed"].includes(value.status)&&value.availableAt<=now&&value.attempts<5);if(!item)return null;item.status="processing";item.attempts+=1;return item; }
  async completeDelivery({id,providerMessageId,now}) { Object.assign(this.deliveries.get(id),{status:"delivered",providerMessageId,deliveredAt:now}); }
  async failDelivery({id,error,now}) { const item=this.deliveries.get(id);Object.assign(item,{status:item.attempts>=5?"dead_letter":"failed",lastError:error,availableAt:new Date(now.getTime()+Math.min(300,2**item.attempts)*1000)}); }
}
