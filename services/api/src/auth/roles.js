import { forbidden } from "./errors.js";

export const Roles = Object.freeze({ OWNER: "owner", ADMIN: "admin", EDITOR: "editor", VIEWER: "viewer" });

const grants = Object.freeze({
  [Roles.OWNER]: ["organization:manage", "members:manage", "assets:read", "assets:write"],
  [Roles.ADMIN]: ["members:manage", "assets:read", "assets:write"],
  [Roles.EDITOR]: ["assets:read", "assets:write"],
  [Roles.VIEWER]: ["assets:read"]
});

export function isRole(value) {
  return Object.values(Roles).includes(value);
}

export function requirePermission(role, permission) {
  if (!grants[role]?.includes(permission)) throw forbidden();
}
