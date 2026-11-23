import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// One of OWASP's recommended scrypt settings: 32 MB per hash, fine on serverless.
const LOG_N = 15;
const R = 8;
const P = 3;
const KEY_BYTES = 32;
const FORMAT = /^scrypt\$(\d{2})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;

function derive(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // NFC: the same Malayalam text can be typed as different code points on different phones
    scrypt(password.normalize("NFC"), salt, KEY_BYTES,
      { N: 2 ** logN, r, p, maxmem: 128 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** scrypt$<log2 N>$<r>$<p>$<salt>$<key>, so the cost can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, LOG_N, R, P);
  return ["scrypt", LOG_N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

// Compared against when there is no such account, so response time doesn't reveal who has one.
const NO_ACCOUNT = { salt: randomBytes(16), key: randomBytes(KEY_BYTES) };

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const m = stored ? FORMAT.exec(stored) : null;
  if (!m) {
    timingSafeEqual(await derive(password, NO_ACCOUNT.salt, LOG_N, R, P), NO_ACCOUNT.key);
    return false;
  }
  const [, logN, r, p, salt, key] = m;
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(logN), Number(r), Number(p));
  return timingSafeEqual(actual, Buffer.from(key, "base64url"));
}
