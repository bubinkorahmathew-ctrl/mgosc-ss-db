import "server-only";
/**
 * Staff logins: teachers (admins manage them) and admins (the super admin manages them).
 * The account functions in lib/authn re-check the acting user inside their own transaction.
 */
import type { z } from "zod";
import { AuthError } from "@/lib/auth";
import * as admins from "@/lib/authn/admins";
import * as teachers from "@/lib/authn/accounts";
import { getDatabase } from "@/lib/db";
import { UserError } from "@/lib/user-error";
import type { createAdminSchema, createTeacherSchema, updateTeacherSchema } from "@/lib/validation/staff";
import { dbAs, requireRole, type Viewer } from "./access";
import { getClassOptions } from "./classes";

const EMAIL_TAKEN = "A user with this email already exists.";
const isDuplicate = (e: unknown) => (e as { code?: string } | null)?.code === "23505";

function superAdmin(user: Viewer) {
  if (!requireRole(user, "headmaster").superAdmin) throw new AuthError("Only a super admin can do that.");
}

// ---------------------------------------------------------------------------
// Teachers (admins)
// ---------------------------------------------------------------------------

/** Returns the temporary password, shown once. */
export async function createTeacher(user: Viewer, details: z.output<typeof createTeacherSchema>): Promise<string> {
  requireRole(user, "headmaster");
  try {
    return (await teachers.createTeacherAccount(getDatabase(), user.id, details)).password;
  } catch (e) {
    if (isDuplicate(e)) throw new UserError(EMAIL_TAKEN);
    throw e;
  }
}

export async function updateTeacher(user: Viewer, input: z.output<typeof updateTeacherSchema>): Promise<void> {
  requireRole(user, "headmaster");
  const { id, ...details } = input;
  try {
    await teachers.updateTeacherAccount(getDatabase(), user.id, id, details);
  } catch (e) {
    if (isDuplicate(e)) throw new UserError(EMAIL_TAKEN, { email: [EMAIL_TAKEN] });
    throw e;
  }
}

export async function setTeacherActive(user: Viewer, id: string, active: boolean): Promise<void> {
  requireRole(user, "headmaster");
  await teachers.setTeacherAccountActive(getDatabase(), user.id, id, active);
}

/** A new temporary password (shown once); the teacher must change it at the next sign-in. */
export async function resetTeacherPassword(user: Viewer, id: string): Promise<string> {
  requireRole(user, "headmaster");
  return teachers.resetTeacherAccountPassword(getDatabase(), user.id, id);
}

/** The Teachers page: teacher profiles, class assignments, this year's classes and sign-in emails. */
export async function teachersPage(user: Viewer) {
  requireRole(user, "headmaster");
  const db = dbAs(user);
  const [list, assignments, classes, emails] = await Promise.all([
    db.select("profiles", { where: [["role", "eq", "teacher"]], order: [{ column: "active", ascending: false }, { column: "full_name" }] }),
    db.select("class_teachers"),
    getClassOptions(user, { currentOnly: true }),
    teachers.listTeacherEmails(getDatabase(), user.id),
  ]);
  return { teachers: list, assignments, classes, emails };
}

// ---------------------------------------------------------------------------
// Admins (super admin)
// ---------------------------------------------------------------------------

export async function listAdmins(user: Viewer) {
  superAdmin(user);
  return admins.listAdminAccounts(getDatabase(), user.id);
}

/** Returns the temporary password, shown once. */
export async function createAdmin(user: Viewer, details: z.output<typeof createAdminSchema>): Promise<string> {
  superAdmin(user);
  try {
    return await admins.createAdminAccount(getDatabase(), user.id, details);
  } catch (e) {
    if (isDuplicate(e)) throw new UserError(EMAIL_TAKEN);
    throw e;
  }
}

export async function setAdminActive(user: Viewer, id: string, active: boolean): Promise<void> {
  superAdmin(user);
  await admins.setAdminAccountActive(getDatabase(), user.id, id, active);
}

export async function resetAdminPassword(user: Viewer, id: string): Promise<string> {
  superAdmin(user);
  return admins.resetAdminAccountPassword(getDatabase(), user.id, id);
}
