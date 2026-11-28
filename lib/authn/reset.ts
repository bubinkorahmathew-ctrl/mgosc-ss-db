import "server-only";
/**
 * "Forgot password": a one-time link, valid for an hour (invites from the Users page: 48 hours). Only the SHA-256 of the token is
 * stored, so the database alone can't be used to reset anyone's password. Using a link sets the
 * new password with the same bcrypt hashing as everything else and ends every existing sign-in
 * (they are older than password_changed_at).
 */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { passwordResetTokens, profiles, users } from "@/db/schema";
import { uuidv7 } from "@/lib/ids";
import { hashPassword } from "./password";

export const RESET_LINK_MINUTES = 60;
/** A new staff member's "Set your password" link (an invite) lasts longer. */
export const INVITE_LINK_MINUTES = 48 * 60;
/** At most this many links per account per hour; more requests are ignored quietly. */
export const RESET_REQUESTS_PER_HOUR = 3;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * A new link for this email, or null when there is nothing to send (no such account, not
 * active, or too many recent requests). The caller says the same thing in every case.
 */
export async function createResetLink(
  db: Db, email: string, now = new Date(), minutes: number = RESET_LINK_MINUTES,
): Promise<{ token: string; name: string; email: string } | null> {
  const address = email.trim().toLowerCase();
  const [account] = await db.select({ id: users.id, email: users.email, name: profiles.fullName, active: profiles.active })
    .from(users).innerJoin(profiles, eq(profiles.id, users.id)).where(eq(users.email, address)).limit(1);
  if (!account?.active) return null;

  const token = randomBytes(32).toString("base64url");
  const made = await db.transaction(async (tx) => {
    // lock the account's row so two requests at once can't both pass the hourly limit
    await tx.select({ id: users.id }).from(users).where(eq(users.id, account.id)).for("update");
    const recent = await tx.select({ id: passwordResetTokens.id }).from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, account.id), gt(passwordResetTokens.createdAt, new Date(now.getTime() - 3_600_000))));
    if (recent.length >= RESET_REQUESTS_PER_HOUR) return false;
    // only the newest link works
    await tx.update(passwordResetTokens).set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, account.id), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({
      id: uuidv7(), userId: account.id, tokenHash: hashToken(token), createdAt: now,
      expiresAt: new Date(now.getTime() + minutes * 60_000),
    });
    return true;
  });
  return made ? { token, name: account.name, email: account.email } : null;
}

/** Whether a link can still be used (to show the form or an error straight away). */
export async function resetLinkIsValid(db: Db, token: string, now = new Date()): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const [row] = await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, hashToken(token)), isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, now))).limit(1);
  return !!row;
}

/** Sets the new password if the link is valid; marks it used. False for an unknown, used or expired link. */
export async function resetPasswordWithLink(db: Db, token: string, password: string, now = new Date()): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const hash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [link] = await tx.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashToken(token))).for("update");
    if (!link || link.usedAt || link.expiresAt <= now) return false;
    const [profile] = await tx.select({ active: profiles.active }).from(profiles).where(eq(profiles.id, link.userId)).for("update");
    if (!profile?.active) return false;
    await tx.update(users).set({ passwordHash: hash, passwordChangedAt: now, mustChangePassword: false }).where(eq(users.id, link.userId));
    await tx.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, link.id));
    return true;
  });
}

/** Newest first: for tests and support only (no tokens are stored). */
export async function resetLinksOf(db: Db, userId: string) {
  return db.select({ createdAt: passwordResetTokens.createdAt, expiresAt: passwordResetTokens.expiresAt, usedAt: passwordResetTokens.usedAt })
    .from(passwordResetTokens).where(eq(passwordResetTokens.userId, userId)).orderBy(desc(passwordResetTokens.createdAt));
}
