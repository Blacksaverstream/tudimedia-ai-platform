import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../src/auth/auth-service.js";
import { AuthError } from "../src/auth/errors.js";
import { InMemoryAuthStore } from "../src/auth/in-memory-store.js";
import * as passwords from "../src/auth/passwords.js";
import { createTokenService } from "../src/auth/tokens.js";

const clock = () => new Date("2026-08-06T12:00:00.000Z");
const createAuth = () => {
  const store = new InMemoryAuthStore();
  const tokens = createTokenService({ secret: "test-token-secret-that-is-at-least-32-characters", issuer: "test", audience: "test", clock });
  return { store, auth: new AuthService({ store, passwords, tokens, sessionPepper: "test-session-pepper-that-is-at-least-32-characters", clock }) };
};

test("sign-up creates an owner, organization, session, and audit trail", async () => {
  const { auth, store } = createAuth();
  const result = await auth.signUp({ email: "Owner@Example.com", password: "a strong password", organizationName: "Tudi Media" });

  assert.equal(result.user.email, "owner@example.com");
  assert.equal(result.role, "owner");
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal((await store.getMembership(result.organization.id, result.user.id)).role, "owner");
  assert.deepEqual(store.auditEvents.map((event) => event.action), ["user.registered", "auth.signed_in"]);
});

test("refresh rotates the token and replaying the old token fails", async () => {
  const { auth } = createAuth();
  const signedUp = await auth.signUp({ email: "owner@example.com", password: "a strong password", organizationName: "Tudi Media" });
  const refreshed = await auth.refresh({ refreshToken: signedUp.refreshToken });

  assert.notEqual(refreshed.refreshToken, signedUp.refreshToken);
  await assert.rejects(() => auth.refresh({ refreshToken: signedUp.refreshToken }), (error) => error instanceof AuthError && error.code === "AUTH_UNAUTHORIZED");
  const actor = await auth.authenticate(refreshed.accessToken);
  assert.equal(actor.userId, signedUp.user.id);
  assert.equal(actor.organizationId, signedUp.organization.id);
  assert.equal(actor.role, "owner");
  assert.ok(actor.sessionId);
});

test("an owner can add a member but a viewer cannot manage members", async () => {
  const { auth, store } = createAuth();
  const owner = await auth.signUp({ email: "owner@example.com", password: "a strong password", organizationName: "Tudi Media" });
  const member = await auth.signUp({ email: "member@example.com", password: "another strong password", organizationName: "Other Media" });
  const actor = await auth.authenticate(owner.accessToken);
  const membership = await auth.addMembership({ actor, email: member.user.email, role: "viewer" });

  assert.equal(membership.role, "viewer");
  await assert.rejects(() => auth.addMembership({ actor: { ...actor, role: "viewer" }, email: member.user.email, role: "editor" }), (error) => error instanceof AuthError && error.code === "AUTH_FORBIDDEN");
  assert.equal(store.auditEvents.at(-1).action, "organization.membership_added");
});

test("sign-out revokes the session behind an access token", async () => {
  const { auth } = createAuth();
  const result = await auth.signUp({ email: "owner@example.com", password: "a strong password", organizationName: "Tudi Media" });
  await auth.signOut({ refreshToken: result.refreshToken });
  await assert.rejects(() => auth.authenticate(result.accessToken), (error) => error instanceof AuthError && error.code === "AUTH_UNAUTHORIZED");
});

test("owners can manage member roles and removal revokes tenant sessions", async () => {
  const { auth, store } = createAuth();
  const owner = await auth.signUp({ email: "owner@example.com", password: "a strong password", organizationName: "Tudi Media" });
  const member = await auth.signUp({ email: "member@example.com", password: "another strong password", organizationName: "Other Media" });
  const actor = await auth.authenticate(owner.accessToken);
  await auth.addMembership({ actor, email: member.user.email, role: "viewer" });
  const signedIn = await auth.signIn({ email: member.user.email, password: "another strong password", organizationId: owner.organization.id });

  const updated = await auth.updateMembership({ actor, userId: member.user.id, role: "editor" });
  assert.equal(updated.role, "editor");
  await assert.rejects(() => auth.authenticate(signedIn.accessToken), (error) => error.code === "AUTH_UNAUTHORIZED");
  await auth.removeMembership({ actor, userId: member.user.id });
  assert.equal(await store.getMembership(owner.organization.id, member.user.id), null);
  assert.deepEqual(store.auditEvents.slice(-2).map((event) => event.action), ["organization.membership_role_changed", "organization.membership_removed"]);
});

test("members can list their tenant and users can update their own profile", async () => {
  const { auth } = createAuth();
  const owner = await auth.signUp({ email: "owner@example.com", password: "a strong password", organizationName: "Tudi Media" });
  const actor = await auth.authenticate(owner.accessToken);
  assert.equal((await auth.listMemberships({ actor })).length, 1);
  assert.equal((await auth.updateProfile({ actor, displayName: "Tudi Owner" })).displayName, "Tudi Owner");
  assert.equal((await auth.updateOrganization({ actor, name: "TudiMedia Studio" })).name, "TudiMedia Studio");
});

test("owner membership cannot be demoted or removed", async () => {
  const { auth } = createAuth();
  const owner = await auth.signUp({ email: "owner@example.com", password: "a strong password", organizationName: "Tudi Media" });
  const actor = await auth.authenticate(owner.accessToken);
  await assert.rejects(() => auth.updateMembership({ actor, userId: actor.userId, role: "admin" }), (error) => error.code === "AUTH_FORBIDDEN");
  await assert.rejects(() => auth.removeMembership({ actor, userId: actor.userId }), (error) => error.code === "AUTH_FORBIDDEN");
});
