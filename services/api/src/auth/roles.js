import { forbidden } from "./errors.js";

export const Roles = Object.freeze({ OWNER: "owner", ADMIN: "admin", EDITOR: "editor", VIEWER: "viewer" });

const grants = Object.freeze({
  [Roles.OWNER]: ["organization:manage", "members:read", "members:manage", "assets:read", "assets:write", "billing:manage", "operations:read", "operations:manage"],
  [Roles.ADMIN]: ["members:read", "members:manage", "assets:read", "assets:write", "operations:read", "operations:manage"],
  [Roles.EDITOR]: ["members:read", "assets:read", "assets:write"],
  [Roles.VIEWER]: ["members:read", "assets:read"]
});

export function isRole(value) {
  return Object.values(Roles).includes(value);
}

export function requirePermission(role, permission) {
  if (!grants[role]?.includes(permission)) throw forbidden();
}
