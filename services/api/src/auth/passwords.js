import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${Buffer.from(hash).toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const [algorithm, cost, blockSize, parallelism, saltEncoded, hashEncoded] = encoded.split("$");
  if (algorithm !== "scrypt" || Number(cost) !== N || Number(blockSize) !== R || Number(parallelism) !== P) return false;

  try {
    const salt = Buffer.from(saltEncoded, "base64url");
    const expected = Buffer.from(hashEncoded, "base64url");
    const actual = Buffer.from(await scrypt(password, salt, expected.length, { N, r: R, p: P, maxmem: 128 * 1024 * 1024 }));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) {
    throw new Error("Password must be between 12 and 256 characters.");
  }
}
