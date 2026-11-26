import "server-only";
/**
 * The super admin account. Used only by scripts/headmaster.ts, i.e. by someone who already holds
 * the database connection string. Never import this from app code.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { profiles, schoolSettings, users } from "@/db/schema";
import { uuidv7 } from "@/lib/ids";
import { hashPassword } from "./password";

export async function findHeadmasters(db: Db) {
  return db.select({ id: profiles.id, email: users.email, full_name: profiles.fullName })
    .from(profiles).innerJoin(users, eq(users.id, profiles.id))
    .where(and(eq(profiles.role, "headmaster"), eq(profiles.isSuper, true)))
    .orderBy(users.email);
}

export async function createFirstHeadmaster(
  db: Db, input: { email: string; full_name: string; password: string },
): Promise<string> {
  const hash = await hashPassword(input.password);
  const id = uuidv7();
  await db.transaction(async (tx) => {
    // the single settings row is the mutex: two runs at once can't both create one
    const [lock] = await tx.select({ id: schoolSettings.id }).from(schoolSettings).where(eq(schoolSettings.id, 1)).for("update");
    if (!lock) throw new Error("school_settings is missing: run the migrations first (npm run db:migrate)");
    const existing = await tx.select({ id: profiles.id }).from(profiles)
      .where(and(eq(profiles.role, "headmaster"), eq(profiles.isSuper, true))).for("update");
    if (existing.length) throw new Error("not allowed: a super admin already exists");
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).for("update");
    if (taken) throw new Error("duplicate key: that email already has an account");
    await tx.insert(profiles).values({ id, fullName: input.full_name, role: "headmaster", isSuper: true });
    // typed by the person themself, so no forced change
    await tx.insert(users).values({ id, email: input.email, passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: false });
  });
  return id;
}

/** Forgotten super admin password: also re-activates the account and signs out every device. */
export async function resetHeadmasterPassword(db: Db, email: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [found] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!found) throw new Error("no account has that email");
    const [profile] = await tx.select({ role: profiles.role, isSuper: profiles.isSuper })
      .from(profiles).where(eq(profiles.id, found.id)).for("update");
    if (profile?.role !== "headmaster" || !profile.isSuper) throw new Error("not allowed: that account is not a super admin");
    await tx.update(profiles).set({ active: true }).where(eq(profiles.id, found.id));
    await tx.update(users).set({ passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: false })
      .where(eq(users.id, found.id));
  });
}
