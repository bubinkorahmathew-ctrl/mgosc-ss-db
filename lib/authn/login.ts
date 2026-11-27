import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { profiles, users } from "@/db/schema";
import type { ProfileRow, UserRole } from "@/lib/db/types";
import { beginLoginAttempt } from "./attempts";
import { hashPassword, needsRehash, verifyPassword } from "./password";

/** A sign-in lasts at most this long, however often it is used. */
export const SESSION_DAYS = 14;
/** Without "Remember me" a sign-in lasts this long (a shared church computer). */
export const SHORT_SESSION_HOURS = 12;

/** Where the request came from, and the key the lockout table is hashed with. */
export type Client = { device: string; secret: string };

/** `authAt`: when this sign-in started. A password change or reset committed after it is always later. */
export type LoginUser = { id: string; email: string; role: UserRole; mustChangePassword: boolean; authAt: number };
export type LoginFailure = "invalid" | "limited" | "inactive";

/**
 * Checks an email and password. "inactive" is only ever returned with the right password,
 * so it reveals nothing to someone guessing.
 */
export async function checkLogin(
  db: Db, email: string, password: string, client: Client, now = new Date(),
): Promise<{ ok: true; user: LoginUser } | { ok: false; reason: LoginFailure }> {
  const address = email.trim().toLowerCase();
  const attempt = await beginLoginAttempt(db, { account: address, device: client.device, secret: client.secret, now });
  if (!attempt.allowed) return { ok: false, reason: "limited" };

  const [account] = await db.select({ id: users.id, hash: users.passwordHash })
    .from(users).where(eq(users.email, address)).limit(1);
  if (!(await verifyPassword(password, account?.hash))) return { ok: false, reason: "invalid" };
  await attempt.succeeded();
  const upgraded = needsRehash(account.hash) ? await hashPassword(password) : null;

  return db.transaction(async (tx) => {
    // lock order everywhere: profiles, then users
    const [profile] = await tx.select({ role: profiles.role, active: profiles.active })
      .from(profiles).where(eq(profiles.id, account.id)).for("update");
    const [login] = await tx.select({ hash: users.passwordHash, mustChange: users.mustChangePassword })
      .from(users).where(eq(users.id, account.id)).for("update");
    // reset while we were checking: the old password must not sign in
    if (!login || login.hash !== account.hash) return { ok: false, reason: "invalid" } as const;
    if (!profile?.active) return { ok: false, reason: "inactive" } as const;
    await tx.update(users).set({ lastLoginAt: now, ...(upgraded && { passwordHash: upgraded }) })
      .where(eq(users.id, account.id));
    return {
      ok: true,
      user: { id: account.id, email: address, role: profile.role, mustChangePassword: login.mustChange, authAt: now.getTime() },
    } as const;
  });
}

/**
 * The signed-in user's own password. Every existing sign-in (this one too) stops working, because
 * it is older than password_changed_at: the caller signs this device in again with the new one.
 */
export async function changeOwnPassword(
  db: Db, userId: string, current: string, next: string, client: Client, now = new Date(),
): Promise<{ ok: true; email: string } | { ok: false; reason: "invalid" | "limited" }> {
  const attempt = await beginLoginAttempt(db, { account: `change:${userId}`, device: client.device, secret: client.secret, now });
  if (!attempt.allowed) return { ok: false, reason: "limited" };

  const [account] = await db.select({ hash: users.passwordHash, email: users.email })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!(await verifyPassword(current, account?.hash))) return { ok: false, reason: "invalid" };
  await attempt.succeeded();
  const hash = await hashPassword(next);

  return db.transaction(async (tx) => {
    const [profile] = await tx.select({ active: profiles.active }).from(profiles).where(eq(profiles.id, userId)).for("update");
    const [login] = await tx.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId)).for("update");
    if (!profile?.active || login?.hash !== account.hash) return { ok: false, reason: "invalid" } as const;
    await tx.update(users).set({ passwordHash: hash, passwordChangedAt: now, mustChangePassword: false })
      .where(eq(users.id, userId));
    return { ok: true, email: account.email } as const;
  });
}

/** Right after a successful sign-in: where to send this person. */
export async function loginTarget(db: Db, email: string): Promise<{ role: UserRole; mustChangePassword: boolean } | null> {
  const [row] = await db.select({ role: profiles.role, mustChangePassword: users.mustChangePassword })
    .from(users).innerJoin(profiles, eq(profiles.id, users.id))
    .where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return row ?? null;
}

/** What the sign-in cookie (an Auth.js JWT) says: who, and when they typed their password. */
/** `remember`: false for a sign-in without "Remember me" (12 hours instead of 14 days). */
export type SessionClaims = { id: string; authAt: number; remember?: boolean };

export type SessionUser = {
  id: string; email: string; superAdmin: boolean; mustChangePassword: boolean; profile: ProfileRow;
};

/**
 * Looked up on every request, so deactivation and password resets take effect at once:
 * a sign-in older than the last password change, or of an inactive profile, is refused.
 */
export async function loadSessionUser(db: Db, claims: Partial<SessionClaims> | null | undefined, now = Date.now()): Promise<SessionUser | null> {
  const { id, authAt, remember } = claims ?? {};
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) || typeof authAt !== "number") return null;
  const lifetime = remember === false ? SHORT_SESSION_HOURS * 3_600_000 : SESSION_DAYS * 86_400_000;
  if (now - authAt > lifetime || authAt > now + 60_000) return null;

  const [row] = await db.select({
    email: users.email, changedAt: users.passwordChangedAt, mustChange: users.mustChangePassword,
    fullName: profiles.fullName, phone: profiles.phone, twelfth: profiles.twelfthPassedYear,
    role: profiles.role, active: profiles.active, isSuper: profiles.isSuper, createdAt: profiles.createdAt,
  }).from(users).innerJoin(profiles, eq(profiles.id, users.id)).where(eq(users.id, id)).limit(1);
  if (!row?.active || row.changedAt.getTime() > authAt) return null;

  return {
    id,
    email: row.email,
    superAdmin: row.role === "headmaster" && row.isSuper,
    mustChangePassword: row.mustChange,
    profile: {
      id, full_name: row.fullName, phone: row.phone, twelfth_passed_year: row.twelfth,
      role: row.role, active: true, created_at: row.createdAt.toISOString(),
    },
  };
}
