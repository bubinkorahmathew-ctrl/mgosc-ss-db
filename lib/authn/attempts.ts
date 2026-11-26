import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, gt, lt, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { loginAttempts } from "@/db/schema";
import { uuidv7 } from "@/lib/ids";

/**
 * Sign-in lockout. Only failures count: a correct password removes them (the whole church
 * may share one address on a Friday).
 */
export const LOGIN_LIMITS = {
  /** one account from one device (address): locked for 15 minutes after 5 failures */
  pair: { max: 5, minutes: 15 },
  /** one device trying many accounts */
  device: { max: 30, minutes: 15 },
  /** one account from anywhere (an address can be faked). Wider, so strangers can't easily lock staff out. */
  account: { max: 50, minutes: 60 },
} as const;

export type Attempt = { allowed: false } | { allowed: true; succeeded(): Promise<void> };

/** HMAC, so the table never holds an email or an address. */
function key(secret: string, kind: string, value: string) {
  return createHmac("sha256", secret).update(`login:${kind}:${value}`).digest("hex");
}

/**
 * Written BEFORE the password is checked, so a burst of parallel guesses can't all pass the count.
 * `account` is the email (or "change:<user id>" for a password change); `device` the client address.
 */
export async function beginLoginAttempt(
  db: Db, input: { account: string; device: string; secret: string; now?: Date },
): Promise<Attempt> {
  const now = input.now ?? new Date();
  const id = uuidv7();
  const accountKey = key(input.secret, "account", input.account.trim().toLowerCase());
  const deviceKey = key(input.secret, "device", input.device);
  await db.insert(loginAttempts).values({ id, accountKey, deviceKey, createdAt: now });

  const since = (minutes: number) => gt(loginAttempts.createdAt, new Date(now.getTime() - minutes * 60_000));
  const { pair, device, account } = LOGIN_LIMITS;
  const [byPair, byDevice, byAccount] = await Promise.all([
    db.$count(loginAttempts, and(eq(loginAttempts.accountKey, accountKey), eq(loginAttempts.deviceKey, deviceKey), since(pair.minutes))),
    db.$count(loginAttempts, and(eq(loginAttempts.deviceKey, deviceKey), since(device.minutes))),
    db.$count(loginAttempts, and(eq(loginAttempts.accountKey, accountKey), since(account.minutes))),
  ]);

  if (byPair > pair.max || byDevice > device.max || byAccount > account.max) {
    // not kept, otherwise retrying while locked would extend the lock for ever
    await db.delete(loginAttempts).where(eq(loginAttempts.id, id));
    return { allowed: false };
  }

  if (Math.random() < 0.05) {
    await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(now.getTime() - 86_400_000)));
  }

  return {
    allowed: true,
    async succeeded() {
      await db.delete(loginAttempts).where(or(
        eq(loginAttempts.id, id),
        and(eq(loginAttempts.accountKey, accountKey), eq(loginAttempts.deviceKey, deviceKey)),
      ));
    },
  };
}
