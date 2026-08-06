import http from "node:http";
import { AuthService } from "./auth/auth-service.js";
import { AuthError } from "./auth/errors.js";
import { InMemoryAuthStore } from "./auth/in-memory-store.js";
import { PostgresAuthStore } from "./auth/postgres-store.js";
import * as passwords from "./auth/passwords.js";
import { createTokenService } from "./auth/tokens.js";
import { InMemoryAssetStore } from "./assets/in-memory-asset-store.js";
import { InMemoryObjectStorage, S3ObjectStorage } from "./assets/object-storage.js";
import { PostgresAssetStore } from "./assets/postgres-asset-store.js";
import { UploadService } from "./assets/upload-service.js";

const port = Number(process.env.PORT ?? 3000);
const production = process.env.NODE_ENV === "production";
const tokenSecret = process.env.AUTH_TOKEN_SECRET;
const sessionPepper = process.env.AUTH_SESSION_PEPPER;
if (!tokenSecret || !sessionPepper) throw new Error("AUTH_TOKEN_SECRET and AUTH_SESSION_PEPPER are required.");

if (production && (!process.env.DATABASE_URL || !process.env.S3_BUCKET || !process.env.S3_REGION)) throw new Error("DATABASE_URL, S3_BUCKET, and S3_REGION are required in production.");
const databasePool = production ? new (await import("pg")).Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? false : undefined }) : null;
const authStore = production ? new PostgresAuthStore(databasePool) : new InMemoryAuthStore();
const assetStore = production ? new PostgresAssetStore(databasePool) : new InMemoryAssetStore();
const objectStorage = production
  ? new S3ObjectStorage({ bucket: process.env.S3_BUCKET, region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" })
  : new InMemoryObjectStorage();
const auth = new AuthService({ store: authStore, passwords, sessionPepper, tokens: createTokenService({ secret: tokenSecret, issuer: "tudimedia-api", audience: "tudimedia-web" }) });
const uploads = new UploadService({ store: assetStore, objectStorage, maxSizeBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024 * 1024) });

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AuthError("REQUEST_INVALID_JSON", "Request body must be valid JSON.", 400); }
};
const cookie = (request, name) => request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
const bearer = (request) => request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : undefined;
const send = (response, status, body, headers = {}) => response.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
const refreshCookie = (token) => `refresh_token=${token}; HttpOnly; Path=/api/v1/auth; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}${production ? "; Secure" : ""}`;

const server = http.createServer(async (request, response) => {
  try {
    const body = await readBody(request);
    if (request.method === "POST" && request.url === "/api/v1/auth/sign-up") {
      const result = await auth.signUp(body);
      return send(response, 201, { ...result, refreshToken: undefined }, { "set-cookie": refreshCookie(result.refreshToken) });
    }
    if (request.method === "POST" && request.url === "/api/v1/auth/sign-in") {
      const result = await auth.signIn(body);
      return send(response, 200, { ...result, refreshToken: undefined }, { "set-cookie": refreshCookie(result.refreshToken) });
    }
    if (request.method === "POST" && request.url === "/api/v1/auth/refresh") {
      const result = await auth.refresh({ refreshToken: cookie(request, "refresh_token") ?? body.refreshToken });
      return send(response, 200, { ...result, refreshToken: undefined }, { "set-cookie": refreshCookie(result.refreshToken) });
    }
    if (request.method === "POST" && request.url === "/api/v1/auth/sign-out") {
      await auth.signOut({ refreshToken: cookie(request, "refresh_token") ?? body.refreshToken });
      return send(response, 204, {}, { "set-cookie": "refresh_token=; HttpOnly; Path=/api/v1/auth; SameSite=Strict; Max-Age=0" });
    }
    if (request.method === "GET" && request.url === "/api/v1/auth/me") return send(response, 200, { actor: await auth.authenticate(bearer(request)) });
    if (request.method === "POST" && request.url === "/api/v1/organizations/members") {
      const membership = await auth.addMembership({ actor: await auth.authenticate(bearer(request)), ...body });
      return send(response, 201, { membership });
    }
    if (request.method === "POST" && request.url === "/api/v1/assets/upload-intents") {
      const result = await uploads.createUploadIntent({ actor: await auth.authenticate(bearer(request)), ...body });
      return send(response, 201, result);
    }
    const completeMatch = request.url?.match(/^\/api\/v1\/assets\/([0-9a-f-]+)\/upload-complete$/i);
    if (request.method === "POST" && completeMatch) {
      return send(response, 202, await uploads.completeUpload({ actor: await auth.authenticate(bearer(request)), assetId: completeMatch[1] }));
    }
    const enrichmentMatch = request.url?.match(/^\/api\/v1\/assets\/([0-9a-f-]+)\/enrichments$/i);
    if (request.method === "GET" && enrichmentMatch) {
      return send(response, 200, { enrichments: await uploads.getEnrichments({ actor: await auth.authenticate(bearer(request)), assetId: enrichmentMatch[1] }) });
    }
    const assetMatch = request.url?.match(/^\/api\/v1\/assets\/([0-9a-f-]+)$/i);
    if (request.method === "GET" && assetMatch) {
      return send(response, 200, { asset: await uploads.getAsset({ actor: await auth.authenticate(bearer(request)), assetId: assetMatch[1] }) });
    }
    return send(response, 404, { error: { code: "NOT_FOUND", message: "Route not found." } });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const code = error instanceof AuthError ? error.code : "INTERNAL_ERROR";
    return send(response, status, { error: { code, message: status === 500 ? "An unexpected error occurred." : error.message } });
  }
});

server.listen(port, () => console.log(`TudiMedia API listening on port ${port}`));
