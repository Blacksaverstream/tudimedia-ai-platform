import { randomUUID } from "node:crypto";

export class InMemoryAuthStore {
  constructor() {
    this.users = new Map();
    this.userByEmail = new Map();
    this.organizations = new Map();
    this.organizationBySlug = new Map();
    this.memberships = new Map();
    this.sessions = new Map();
    this.auditEvents = [];
  }

  async createUser({ email, passwordHash }) {
    if (this.userByEmail.has(email)) return null;
    const user = { id: randomUUID(), email, passwordHash, createdAt: new Date() };
    this.users.set(user.id, user);
    this.userByEmail.set(email, user.id);
    return user;
  }

  async getUserByEmail(email) { return this.users.get(this.userByEmail.get(email)) ?? null; }
  async getUser(id) { return this.users.get(id) ?? null; }

  async createOrganization({ name, slug }) {
    if (this.organizationBySlug.has(slug)) return null;
    const organization = { id: randomUUID(), name, slug, createdAt: new Date() };
    this.organizations.set(organization.id, organization);
    this.organizationBySlug.set(slug, organization.id);
    return organization;
  }

  membershipKey(organizationId, userId) { return `${organizationId}:${userId}`; }
  async createMembership({ organizationId, userId, role }) {
    const key = this.membershipKey(organizationId, userId);
    if (this.memberships.has(key)) return null;
    const membership = { id: randomUUID(), organizationId, userId, role, createdAt: new Date() };
    this.memberships.set(key, membership);
    return membership;
  }

  async getMembership(organizationId, userId) { return this.memberships.get(this.membershipKey(organizationId, userId)) ?? null; }

  async createSession(session) { this.sessions.set(session.id, { ...session }); return this.sessions.get(session.id); }
  async getSession(id) { return this.sessions.get(id) ?? null; }
  async rotateSession({ id, expectedRefreshHash, nextRefreshHash, now, expiresAt }) {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt || session.expiresAt <= now || session.refreshHash !== expectedRefreshHash) return null;
    session.refreshHash = nextRefreshHash;
    session.expiresAt = expiresAt;
    session.lastUsedAt = now;
    return session;
  }

  async revokeSession(id, now) {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt) return false;
    session.revokedAt = now;
    return true;
  }

  async appendAudit(event) { this.auditEvents.push({ id: randomUUID(), occurredAt: new Date(), ...event }); }
}
