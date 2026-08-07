export const publicRoutes = new Set(["/", "/pricing"]);
export const appRoutes = new Set(["/app", "/app/library", "/app/editor", "/app/admin", "/app/design-system"]);
export function normalizeRoute(pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  return publicRoutes.has(path) || appRoutes.has(path) ? path : "/not-found";
}
