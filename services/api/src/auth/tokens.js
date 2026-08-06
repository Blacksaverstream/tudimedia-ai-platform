import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { unauthorized } from "./errors.js";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const decode = (value) => JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
const signature = (input, secret) => createHmac("sha256", secret).update(input).digest("base64url");

export function createTokenService({ secret, issuer, audience, clock = () => new Date(), ttlSeconds = 900 }) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("AUTH_TOKEN_SECRET must be at least 32 characters.");

  return {
    issue({ userId, organizationId, role, sessionId }) {
      const now = Math.floor(clock().getTime() / 1000);
      const header = encode({ alg: "HS256", typ: "JWT" });
      const payload = encode({
        iss: issuer,
        aud: audience,
        sub: userId,
        org: organizationId,
        role,
        sid: sessionId,
        iat: now,
        exp: now + ttlSeconds,
        jti: randomUUID()
      });
      const input = `${header}.${payload}`;
      return `${input}.${signature(input, secret)}`;
    },

    verify(token) {
      if (typeof token !== "string") throw unauthorized("A bearer token is required.");
      const [header, payload, provided] = token.split(".");
      if (!header || !payload || !provided) throw unauthorized("The access token is malformed.");
      const expected = Buffer.from(signature(`${header}.${payload}`, secret));
      const actual = Buffer.from(provided);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw unauthorized("The access token is invalid.");

      let decodedHeader;
      let claims;
      try {
        decodedHeader = decode(header);
        claims = decode(payload);
      } catch {
        throw unauthorized("The access token is malformed.");
      }
      const now = Math.floor(clock().getTime() / 1000);
      if (decodedHeader.alg !== "HS256" || claims.iss !== issuer || claims.aud !== audience || !claims.sub || !claims.org || !claims.sid || claims.exp <= now) {
        throw unauthorized("The access token is expired or invalid.");
      }
      return claims;
    }
  };
}
