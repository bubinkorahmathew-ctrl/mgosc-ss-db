import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionToken } from "@/lib/authn/request";
import { resolveSession, type SessionUser } from "@/lib/authn/session";
import { getDatabase } from "@/lib/db";
import { createDb, type Db } from "@/lib/db/client";
import type { UserRole } from "@/lib/db/types";

export type CurrentUser = SessionUser;

/**
 * The signed-in user plus their profile, checked against the session table.
 * Cached per render. Returns null when signed out, expired or deactivated.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  return resolveSession(getDatabase(), token);
});

/** Database access as the signed-in user (or an anonymous visitor): the policies apply. */
export async function getUserDb(): Promise<Db> {
  const user = await getCurrentUser();
  return createDb(getDatabase(), user?.id ?? null);
}

/** For pages/layouts: redirect unless the user has the role. */
export async function requireRole(role: UserRole): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profile.role !== role) redirect(homeFor(user.profile.role));
  return user;
}

export function homeFor(role: UserRole) {
  return role === "headmaster" ? "/admin" : "/teacher";
}

export class AuthError extends Error {
  constructor(message = "You are not allowed to do that.") {
    super(message);
  }
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function assertRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.profile.role)) throw new AuthError();
  return user;
}

/** School settings and admin accounts. */
export async function assertSuperAdmin(): Promise<CurrentUser> {
  const user = await assertRole("headmaster");
  if (!user.superAdmin) throw new AuthError("Only a super admin can do that.");
  return user;
}

/** Class ids the current user may work with (all classes for headmaster). */
export async function accessibleClassIds(user: CurrentUser): Promise<string[] | "all"> {
  if (user.profile.role === "headmaster") return "all";
  const db = createDb(getDatabase(), user.id);
  const rows = await db.select("class_teachers", { where: [["teacher_id", "eq", user.id]] });
  return rows.map((r) => r.class_id);
}

/** Server-side re-check of class ownership (on top of the policies). */
export async function assertClassAccess(user: CurrentUser, classId: string) {
  const ids = await accessibleClassIds(user);
  if (ids !== "all" && !ids.includes(classId)) throw new AuthError("That class is not assigned to you.");
}
