import "server-only";
import { scrypt, timingSafeEqual } from "node:crypto";
import { compare, getRounds, hash } from "bcryptjs";

/** bcrypt cost: about a quarter of a second per hash on a serverless function. */
export const BCRYPT_COST = 12;

// NFC: the same Malayalam text can be typed as different code points on different phones
const normal = (password: string) => password.normalize("NFC");

export function hashPassword(password: string): Promise<string> {
  return hash(normal(password), BCRYPT_COST);
}

// Compared against when there is no such account, so response time doesn't reveal who has one.
let dummy: Promise<string> | undefined;

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  try {
    if (stored?.startsWith("$2")) return await compare(normal(password), stored);
    if (stored && LEGACY.test(stored)) return await verifyLegacy(password, stored);
  } catch {
    return false; // a damaged hash
  }
  await compare(password, await (dummy ??= hash("no account", BCRYPT_COST)));
  return false;
}

/** True for hashes from before Auth.js (scrypt) or with a lower cost: replaced at the next sign-in. */
export function needsRehash(stored: string): boolean {
  if (!stored.startsWith("$2")) return true;
  try {
    return getRounds(stored) < BCRYPT_COST;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Legacy: scrypt hashes written before Phase S2. Only verified, never written. Each is
// replaced by a bcrypt hash the first time its owner signs in.
// ---------------------------------------------------------------------------
const LEGACY = /^scrypt\$(\d{2})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;

async function verifyLegacy(password: string, stored: string): Promise<boolean> {
  const [, logN, r, p, salt, key] = LEGACY.exec(stored)!;
  if (Number(logN) > 20) return false;
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(normal(password), Buffer.from(salt, "base64url"), 32,
      { N: 2 ** Number(logN), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024 },
      (error, derived) => (error ? reject(error) : resolve(derived)));
  });
  return timingSafeEqual(actual, Buffer.from(key, "base64url"));
}
