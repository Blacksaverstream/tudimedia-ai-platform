import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { AuthError, forbidden, unauthorized } from "./errors.js";
import { Roles, isRole, requirePermission } from "./roles.js";

const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const slugify = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);

export class AuthService {
  constructor({ store, passwords, tokens, sessionPepper, clock = () => new Date(), sessionTtlDays = 30 }) {
    if (!store || !passwords || !tokens || typeof sessionPepper !== "string" || sessionPepper.length < 32) throw new Error("Authentication service is not configured securely.");
    this.store = store;
    this.passwords = passwords;
    this.tokens = tokens;
    this.sessionPepper = sessionPepper;
    this.clock = clock;
    this.sessionTtlDays = sessionTtlDays;
  }

  async signUp({ email, password, organizationName }) {
    return this.store.transaction((store) => this.signUpInTransaction(store, { email, password, organizationName }));
  }

  async signUpInTransaction(store, { email, password, organizationName }) {
    const normalizedEmail = normalizeEmail(email);
    const name = String(organizationName ?? "").trim();
    if (!validEmail(normalizedEmail) || name.length < 2 || name.length > 120) throw new AuthError("AUTH_VALIDATION", "A valid email and organization name are required.", 422);
    const passwordHash = await this.passwords.hashPassword(password);
    const user = await store.createUser({ email: normalizedEmail, passwordHash });
    if (!user) throw new AuthError("AUTH_EMAIL_IN_USE", "An account already uses this email address.", 409);

    const baseSlug = slugify(name) || "organization";
    let organization;
    for (let suffix = 0; suffix < 10 && !organization; suffix += 1) {
      organization = await store.createOrganization({ name, slug: suffix ? `${baseSlug}-${suffix + 1}` : baseSlug });
    }
    if (!organization) throw new AuthError("AUTH_ORGANIZATION_CONFLICT", "Unable to create an organization. Please choose another name.", 409);

    await store.createMembership({ organizationId: organization.id, userId: user.id, role: Roles.OWNER });
    const session = await this.createSession(store, { user, organization, role: Roles.OWNER });
    await this.audit(store, "user.registered", { organizationId: organization.id, actorUserId: user.id, targetUserId: user.id });
    await this.audit(store, "auth.signed_in", { organizationId: organization.id, actorUserId: user.id, targetUserId: user.id, sessionId: session.id });
    return this.response(user, organization, Roles.OWNER, session);
  }

  async signIn({ email, password, organizationId }) {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.store.getUserByEmail(normalizedEmail);
    if (!user || !(await this.passwords.verifyPassword(password, user.passwordHash))) {
      await this.audit("auth.sign_in_failed", { metadata: { email: normalizedEmail } });
      throw unauthorized("Invalid email or password.");
    }
    const membership = await this.store.getMembership(organizationId, user.id);
    if (!membership) throw unauthorized("Invalid email or password.");
    const organization = await this.store.getOrganization(organizationId);
    if (!organization) throw unauthorized("Invalid email or password.");
    const session = await this.createSession(this.store, { user, organization, role: membership.role });
    await this.audit(this.store, "auth.signed_in", { organizationId, actorUserId: user.id, targetUserId: user.id, sessionId: session.id });
    return this.response(user, organization, membership.role, session);
  }

  async refresh({ refreshToken }) {
    return this.store.transaction((store) => this.refreshInTransaction(store, { refreshToken }));
  }

  async refreshInTransaction(store, { refreshToken }) {
    const { sessionId, secret } = this.parseRefreshToken(refreshToken);
    const now = this.clock();
    const nextSecret = randomBytes(32).toString("base64url");
    const rotated = await store.rotateSession({ id: sessionId, expectedRefreshHash: this.refreshHash(secret), nextRefreshHash: this.refreshHash(nextSecret), now, expiresAt: this.sessionExpiry(now) });
    if (!rotated) throw unauthorized("Your session has expired. Please sign in again.");
    const user = await store.getUser(rotated.userId);
    const membership = await store.getMembership(rotated.organizationId, rotated.userId);
    if (!user || !membership) throw unauthorized("Your session is no longer valid.");
    const organization = await store.getOrganization(rotated.organizationId);
    if (!organization) throw unauthorized("Your session is no longer valid.");
    await this.audit(store, "auth.session_refreshed", { organizationId: rotated.organizationId, actorUserId: user.id, targetUserId: user.id, sessionId });
    return this.response(user, organization, membership.role, { ...rotated, rawRefreshToken: `${sessionId}.${nextSecret}` });
  }

  async signOut({ refreshToken }) {
    try {
      const { sessionId, secret } = this.parseRefreshToken(refreshToken);
      const session = await this.store.getSession(sessionId);
      if (session && session.refreshHash === this.refreshHash(secret) && await this.store.revokeSession(sessionId, this.clock())) {
        await this.audit(this.store, "auth.signed_out", { organizationId: session.organizationId, actorUserId: session.userId, targetUserId: session.userId, sessionId });
      }
    } catch {
      // Sign-out is intentionally idempotent and does not reveal session state.
    }
  }

  async authenticate(accessToken) {
    const claims = this.tokens.verify(accessToken);
    const session = await this.store.getSession(claims.sid);
    const membership = await this.store.getMembership(claims.org, claims.sub);
    if (!session || session.revokedAt || session.expiresAt <= this.clock() || !membership || membership.role !== claims.role) throw unauthorized("Your session is no longer valid.");
    return { userId: claims.sub, organizationId: claims.org, role: claims.role, sessionId: claims.sid };
  }

  async addMembership({ actor, email, role }) {
    requirePermission(actor.role, "members:manage");
    if (!isRole(role) || role === Roles.OWNER) throw new AuthError("AUTH_VALIDATION", "Select a valid non-owner role.", 422);
    const user = await this.store.getUserByEmail(normalizeEmail(email));
    if (!user) throw new AuthError("AUTH_USER_NOT_FOUND", "The invited user must create an account first.", 404);
    const membership = await this.store.createMembership({ organizationId: actor.organizationId, userId: user.id, role });
    if (!membership) throw new AuthError("AUTH_MEMBERSHIP_EXISTS", "This user already belongs to the organization.", 409);
    await this.audit(this.store, "organization.membership_added", { organizationId: actor.organizationId, actorUserId: actor.userId, targetUserId: user.id, metadata: { role } });
    return membership;
  }

  async createSession(store, { user, organization, role }) {
    const id = randomUUID();
    const secret = randomBytes(32).toString("base64url");
    const now = this.clock();
    const session = await store.createSession({ id, userId: user.id, organizationId: organization.id, role, refreshHash: this.refreshHash(secret), expiresAt: this.sessionExpiry(now), createdAt: now, lastUsedAt: now, rawRefreshToken: `${id}.${secret}` });
    return { ...session, rawRefreshToken: `${id}.${secret}` };
  }

  response(user, organization, role, session) {
    return { user: { id: user.id, email: user.email }, organization: { id: organization.id, name: organization.name, slug: organization.slug }, role, accessToken: this.tokens.issue({ userId: user.id, organizationId: organization.id, role, sessionId: session.id }), refreshToken: session.rawRefreshToken };
  }

  refreshHash(secret) { return createHmac("sha256", this.sessionPepper).update(secret).digest("base64url"); }
  sessionExpiry(now) { return new Date(now.getTime() + this.sessionTtlDays * 24 * 60 * 60 * 1000); }
  parseRefreshToken(token) {
    const [sessionId, secret] = String(token ?? "").split(".");
    if (!sessionId || !secret) throw unauthorized("A refresh token is required.");
    return { sessionId, secret };
  }
  async audit(store, action, details = {}) { await store.appendAudit({ action, ...details }); }
}
