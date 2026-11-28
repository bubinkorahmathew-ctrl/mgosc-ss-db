import "server-only";
/**
 * lib/repo: the only code that reaches the database. Every function takes the user it acts for
 * as its FIRST argument (null = a public visitor), taken from a verified sign-in by the caller
 * (lib/auth getCurrentUser / requireRole / assertRole), never from request input.
 *
 * Underneath, reads and writes go through the policy engine (lib/db): default-deny row rules per
 * role, plus the data checks Postgres used to do with triggers. ESLint stops anything outside
 * lib/repo, lib/authn and lib/db from importing a database client.
 */
import { AuthError, type CurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { createDb } from "@/lib/db/client";
import { createQueryClient } from "@/lib/db/query";
import { hasRole, isAdmin, type RoleGuard } from "@/lib/permissions";

export type Viewer = CurrentUser;

/** The policy-checked table client, acting as this user. */
export function dbAs(user: Viewer | null) {
  return createDb(getDatabase(), user?.id ?? null);
}

/** The policy-checked query builder (select with joins, filters, order), acting as this user. */
export function queryAs(user: Viewer | null) {
  return createQueryClient(dbAs(user));
}

/** Throws unless signed in. */
export function requireUser(user: Viewer | null): Viewer {
  if (!user) throw new AuthError("Please sign in again.");
  return user;
}

/** Throws unless the user has one of the roles ("admin" = admin or super admin; effective role). */
export function requireRole(user: Viewer | null, ...roles: RoleGuard[]): Viewer {
  const u = requireUser(user);
  if (!roles.some((r) => hasRole(u.profile.role, r))) throw new AuthError();
  return u;
}

/** Class ids a teacher is assigned to; "all" for admins; none for anyone else. */
export async function teacherClassIds(user: Viewer): Promise<string[] | "all"> {
  if (isAdmin(user.profile.role)) return "all";
  if (user.profile.role !== "teacher") return [];
  const rows = await dbAs(user).select("class_teachers", { where: [["teacher_id", "eq", user.id]] });
  return rows.map((r) => r.class_id);
}

/** Server-side re-check of class ownership (on top of the policies). Admins pass. */
export async function assertTeacherOfClass(user: Viewer, classId: string): Promise<void> {
  const ids = await teacherClassIds(user);
  if (ids !== "all" && !ids.includes(classId)) throw new AuthError("That class is not assigned to you.");
}
