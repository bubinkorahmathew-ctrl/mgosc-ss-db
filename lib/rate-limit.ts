import { createHash } from "node:crypto";

export const REGISTRATION_LIMIT = { max: 5, windowMinutes: 60 } as const;

export interface AttemptStore {
  /** number of attempts for this key since `since` */
  count(key: string, since: Date): Promise<number>;
  record(key: string): Promise<void>;
  /** optional housekeeping */
  purgeOlderThan?(before: Date): Promise<void>;
}

/** Salted SHA-256 so raw IP addresses are never stored. */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** First address in X-Forwarded-For (set by Vercel), else X-Real-IP, else "unknown". */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Returns true if the attempt is allowed (and records it), false if over the limit.
 */
export async function checkAndRecord(
  store: AttemptStore, key: string,
  limit: { max: number; windowMinutes: number } = REGISTRATION_LIMIT,
  now: Date = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - limit.windowMinutes * 60_000);
  const n = await store.count(key, since);
  if (n >= limit.max) return false;
  await store.record(key);
  // opportunistic cleanup of rows older than a day
  if (store.purgeOlderThan && Math.random() < 0.05) {
    await store.purgeOlderThan(new Date(now.getTime() - 24 * 3600_000)).catch(() => {});
  }
  return true;
}
