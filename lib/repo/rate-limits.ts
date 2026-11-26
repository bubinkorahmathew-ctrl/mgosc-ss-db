import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { rateLimits } from "@/db/schema";

/** Public forms and their limits: at most `max` submissions per device per window. */
export const RATE_LIMITS = {
  registration: { max: 5, minutes: 60 },
} as const;
export type RateLimitName = keyof typeof RATE_LIMITS;

function keyFor(name: string, device: string, secret: string) {
  return createHmac("sha256", secret).update(`rate:${name}:${device}`).digest("hex");
}

/**
 * Counts this submission and says whether it is within the limit. One atomic upsert, so
 * parallel submissions can't all slip under it. Public (no user): only the server's own values.
 */
export async function takeRateLimit(
  name: RateLimitName, device: string, secret: string, now = new Date(), db: Db = getDb(),
): Promise<boolean> {
  const { max, minutes } = RATE_LIMITS[name];
  const size = minutes * 60_000;
  const windowStart = new Date(Math.floor(now.getTime() / size) * size);
  const key = keyFor(name, device, secret);
  return db.transaction(async (tx) => {
    await tx.insert(rateLimits).values({ key, windowStart, count: 1 })
      .onDuplicateKeyUpdate({ set: { count: sql`${rateLimits.count} + 1` } });
    const [row] = await tx.select({ count: rateLimits.count }).from(rateLimits)
      .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)));
    if (Math.random() < 0.05) await tx.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 86_400_000)));
    return (row?.count ?? 0) <= max;
  });
}
