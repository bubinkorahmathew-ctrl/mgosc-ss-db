import "server-only";
/**
 * Who gets notification emails, and the facts the emails need. System lookups (the public
 * registration form has no signed-in user): they return names and addresses only, and are used
 * only by lib/email/notifications.ts. Only active staff with email notifications switched on.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { classes, classTeachers, prayerUnits, profiles, students, users } from "@/db/schema";
import { ADMIN_NOW_SQL } from "@/lib/db/policies";
import { requireUser, type Viewer } from "./access";

export type Recipient = { name: string; email: string };

/** Admins and super admins (temporary admins only while their access lasts), e.g. for new registrations. `except`: the person who acted. */
export async function adminRecipients(except?: string): Promise<Recipient[]> {
  return getDb().select({ name: profiles.fullName, email: users.email })
    .from(profiles).innerJoin(users, eq(users.id, profiles.id))
    .where(and(sql.raw(ADMIN_NOW_SQL.replaceAll("me.", "profiles.")), eq(profiles.active, true), eq(profiles.emailNotifications, true),
      ...(except ? [ne(profiles.id, except)] : [])));
}

/** Everyone assigned to a class (whatever their role). `except`: the person who acted. */
export async function classTeacherRecipients(classId: string, except?: string): Promise<Recipient[]> {
  return getDb().select({ name: profiles.fullName, email: users.email })
    .from(classTeachers)
    .innerJoin(profiles, eq(profiles.id, classTeachers.teacherId))
    .innerJoin(users, eq(users.id, profiles.id))
    .where(and(eq(classTeachers.classId, classId), eq(profiles.active, true),
      eq(profiles.emailNotifications, true), ...(except ? [ne(profiles.id, except)] : [])));
}

/** A student with their class name, for the "new student in your class" email. */
export async function studentForNotice(studentId: string) {
  const [s] = await getDb().select({
    name: students.fullName, admissionNo: students.admissionNo, classId: students.classId,
    className: classes.name, section: classes.section,
  }).from(students).leftJoin(classes, eq(classes.id, students.classId)).where(eq(students.id, studentId));
  return s ?? null;
}

export async function prayerUnitName(id: string): Promise<string | null> {
  const [u] = await getDb().select({ name: prayerUnits.name }).from(prayerUnits).where(inArray(prayerUnits.id, [id]));
  return u?.name ?? null;
}

// ---------------------------------------------------------------------------
// The signed-in person's own setting
// ---------------------------------------------------------------------------

export async function getEmailNotifications(user: Viewer): Promise<boolean> {
  requireUser(user);
  const [p] = await getDb().select({ on: profiles.emailNotifications }).from(profiles).where(eq(profiles.id, user.id));
  return p?.on ?? true;
}

export async function setEmailNotifications(user: Viewer, on: boolean): Promise<void> {
  requireUser(user);
  await getDb().update(profiles).set({ emailNotifications: on }).where(eq(profiles.id, user.id));
}
