import "server-only";
/**
 * Staff: people (profiles), their logins, roles, designations, temporary admin access and class
 * assignments. A teacher profile can exist without a login; giving it an email creates the login
 * (linked 1:1: the login has the profile's id). All permission decisions: lib/permissions.ts.
 * Every change of role, admin access, activation, login or classes is written to audit_log.
 */
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { academicYears, auditLog, classTeachers, classes, profiles, users } from "@/db/schema";
import { AuthError } from "@/lib/auth";
import { hashPassword } from "@/lib/authn/password";
import { generateTempPassword } from "@/lib/password";
import { uuidv7 } from "@/lib/ids";
import {
  assignableRoles, canEditPerson, canManageUsers, deactivationProblem, getEffectiveRole, roleChangeProblem,
  type Designation, type Role,
} from "@/lib/permissions";
import { UserError } from "@/lib/user-error";
import { classLabel } from "@/lib/format";
import { requireUser, type Viewer } from "./access";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export type PersonInput = {
  full_name: string; email: string | null; role: Role; designation: Designation | null; phone: string | null;
  twelfth_passed_year: number | null; admin_access_until: Date | null; active: boolean;
  classes: { class_id: string; is_class_teacher: boolean }[];
};

function manager(user: Viewer | null): Viewer & { role: Role } {
  const u = requireUser(user);
  if (!canManageUsers(u.profile.role)) throw new AuthError();
  return Object.assign(u, { role: u.profile.role });
}

/** Inside the write's transaction: the actor is still active and may still manage users (locked). */
async function recheck(tx: Tx, actorId: string): Promise<Role> {
  const [me] = await tx.select({ role: profiles.role, active: profiles.active, until: profiles.adminAccessUntil })
    .from(profiles).where(eq(profiles.id, actorId)).for("update");
  const role = me?.active ? getEffectiveRole({ role: me.role, admin_access_until: me.until }) : null;
  if (!role || !canManageUsers(role)) throw new AuthError();
  return role;
}

async function audit(tx: Tx, actorId: string, targetId: string, action: string, details: Record<string, unknown> = {}) {
  await tx.insert(auditLog).values({ id: uuidv7(), actorId, targetId, action, details });
}

/** Active super admins, locked: the last one may not be demoted or deactivated. */
async function activeSuperAdmins(tx: Tx): Promise<number> {
  const rows = await tx.select({ id: profiles.id }).from(profiles)
    .where(and(eq(profiles.role, "super_admin"), eq(profiles.active, true))).orderBy(asc(profiles.id)).for("update");
  return rows.length;
}

async function emailFree(tx: Tx, email: string, except?: string) {
  const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).for("update");
  if (taken && taken.id !== except) throw new UserError("Another account already uses this email.", { email: ["Already in use."] });
}

/** This year's assignments become exactly `want` (past years are history and are kept). */
async function syncClasses(tx: Tx, personId: string, want: PersonInput["classes"]) {
  const current = new Set((await tx.select({ id: classes.id }).from(classes)
    .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
    .where(eq(academicYears.isCurrent, true)).for("update")).map((c) => c.id));
  if (want.some((c) => !current.has(c.class_id))) throw new UserError("A chosen class is not in the current year.");
  const have = await tx.select().from(classTeachers).where(eq(classTeachers.teacherId, personId)).for("update");
  const wanted = new Map(want.map((c) => [c.class_id, c.is_class_teacher]));
  const remove = have.filter((h) => current.has(h.classId) && !wanted.has(h.classId)).map((h) => h.classId);
  if (remove.length) await tx.delete(classTeachers).where(and(eq(classTeachers.teacherId, personId), inArray(classTeachers.classId, remove)));
  for (const [classId, isClassTeacher] of wanted) {
    const existing = have.find((h) => h.classId === classId);
    if (!existing) await tx.insert(classTeachers).values({ classId, teacherId: personId, isClassTeacher });
    else if (existing.isClassTeacher !== isClassTeacher) {
      await tx.update(classTeachers).set({ isClassTeacher })
        .where(and(eq(classTeachers.teacherId, personId), eq(classTeachers.classId, classId)));
    }
  }
  return { added: [...wanted.keys()].filter((id) => !have.some((h) => h.classId === id)), removed: remove };
}

/** A login that can't be used until the person sets a password from the emailed link. */
const unusablePassword = () => hashPassword(randomBytes(32).toString("base64url"));

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type PersonFilters = { q?: string; role?: Role; designation?: Designation; active?: boolean };

/** The Users page: everyone the user may manage (super admin: all; admin: all, read-only for admins). */
export async function listPeople(user: Viewer | null, f: PersonFilters = {}) {
  manager(user);
  const d = getDb();
  const now = new Date();
  const rows = await d.select({
    id: profiles.id, name: profiles.fullName, phone: profiles.phone, twelfth: profiles.twelfthPassedYear,
    role: profiles.role, designation: profiles.designation, active: profiles.active, adminAccessUntil: profiles.adminAccessUntil,
    email: users.email, lastLoginAt: users.lastLoginAt,
  }).from(profiles).leftJoin(users, eq(users.id, profiles.id)).orderBy(asc(profiles.fullName));
  const assignments = await d.select({
    teacherId: classTeachers.teacherId, classId: classes.id, name: classes.name, section: classes.section,
    isClassTeacher: classTeachers.isClassTeacher,
  }).from(classTeachers).innerJoin(classes, eq(classes.id, classTeachers.classId))
    .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId)).where(eq(academicYears.isCurrent, true));
  const q = f.q?.trim().toLowerCase();
  return rows
    .map((r) => ({
      ...r,
      effectiveRole: getEffectiveRole({ role: r.role, admin_access_until: r.adminAccessUntil }, now),
      hasLogin: r.email !== null,
      classes: assignments.filter((a) => a.teacherId === r.id)
        .map((a) => ({ id: a.classId, label: classLabel(a), isClassTeacher: a.isClassTeacher }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    }))
    .filter((r) => (!q || r.name.toLowerCase().includes(q) || (r.email ?? "").includes(q))
      && (!f.role || r.role === f.role) && (!f.designation || r.designation === f.designation)
      && (f.active === undefined || r.active === f.active));
}
export type Person = Awaited<ReturnType<typeof listPeople>>[number];

/** The current year's classes, for the assignment picker. */
export async function currentClassOptions(user: Viewer | null) {
  manager(user);
  const rows = await getDb().select({ id: classes.id, name: classes.name, section: classes.section }).from(classes)
    .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId)).where(eq(academicYears.isCurrent, true));
  return rows.map((c) => ({ id: c.id, label: classLabel(c) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Creates a person: a teacher profile, and a login when an email is given (no password: the
 * caller emails a "Set your password" link). Returns whether a login was created.
 */
export async function createPerson(user: Viewer | null, input: PersonInput): Promise<{ id: string; login: boolean }> {
  const actor = manager(user);
  if (!assignableRoles(actor.role).includes(input.role)) throw new UserError("You can't give that role.");
  if (input.role !== "teacher" && !input.email) throw new UserError("An admin needs an email to sign in.", { email: ["Required for this role."] });
  const id = uuidv7();
  const hash = input.email ? await unusablePassword() : null;
  await getDb().transaction(async (tx) => {
    if (!assignableRoles(await recheck(tx, actor.id)).includes(input.role)) throw new UserError("You can't give that role.");
    if (input.email) await emailFree(tx, input.email);
    await tx.insert(profiles).values({
      id, fullName: input.full_name, phone: input.phone, twelfthPassedYear: input.twelfth_passed_year, role: input.role,
      designation: input.designation, active: input.active, adminAccessUntil: input.role === "admin" ? input.admin_access_until : null,
    });
    if (input.email && hash) {
      await tx.insert(users).values({ id, email: input.email, passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: false });
    }
    const { added } = await syncClasses(tx, id, input.classes);
    await audit(tx, actor.id, id, "create", { role: input.role, login: !!input.email, designation: input.designation, classes: added });
    if (input.role === "admin") await audit(tx, actor.id, id, "admin_access", { until: input.admin_access_until?.toISOString() ?? "permanent" });
  });
  return { id, login: !!input.email };
}

/**
 * Edits a person. Role, activation and admin access follow lib/permissions.ts; an email given to a
 * profile without a login creates the login (returned as `newLogin`, so the caller sends an invite).
 */
export async function updatePerson(user: Viewer | null, id: string, input: PersonInput): Promise<{ newLogin: boolean }> {
  const actor = manager(user);
  let newLogin = false;
  const hash = input.email ? await unusablePassword() : null;
  await getDb().transaction(async (tx) => {
    // super admins first, always in the same order: two super admins changing each other at
    // once queue up instead of deadlocking, and the second sees the first one's change
    const supers = await activeSuperAdmins(tx);
    actor.role = await recheck(tx, actor.id);
    const [target] = await tx.select().from(profiles).where(eq(profiles.id, id)).for("update");
    if (!target) throw new UserError("That person was not found.");
    if (!canEditPerson(actor.role, { role: target.role })) throw new UserError("You can't change this account.");

    if (input.role !== target.role) {
      const problem = roleChangeProblem({ actorId: actor.id, actor: actor.role, targetId: id, from: target.role, to: input.role, activeSuperAdmins: supers });
      if (problem) throw new UserError(problem, { role: [problem] });
      await audit(tx, actor.id, id, "role", { from: target.role, to: input.role });
    }
    if (input.active !== target.active) {
      if (!input.active) {
        const problem = deactivationProblem({ actorId: actor.id, actor: actor.role, targetId: id, target: target.role, activeSuperAdmins: supers });
        if (problem) throw new UserError(problem, { active: [problem] });
      }
      await audit(tx, actor.id, id, input.active ? "activate" : "deactivate");
    }
    const until = input.role === "admin" ? input.admin_access_until : null;
    const before = target.adminAccessUntil?.getTime() ?? null;
    if (input.role === "admin" && (input.role !== target.role || (until?.getTime() ?? null) !== before)) {
      await audit(tx, actor.id, id, "admin_access", { until: until?.toISOString() ?? "permanent" });
    }

    await tx.update(profiles).set({
      fullName: input.full_name, phone: input.phone, twelfthPassedYear: input.twelfth_passed_year, role: input.role,
      designation: input.designation, active: input.active, adminAccessUntil: until,
    }).where(eq(profiles.id, id));

    const [login] = await tx.select({ email: users.email }).from(users).where(eq(users.id, id)).for("update");
    if (login && input.email && input.email !== login.email) {
      await emailFree(tx, input.email, id);
      await tx.update(users).set({ email: input.email }).where(eq(users.id, id));
      await audit(tx, actor.id, id, "email", { from: login.email, to: input.email });
    } else if (!login && input.email && hash) {
      await emailFree(tx, input.email);
      await tx.insert(users).values({ id, email: input.email, passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: false });
      await audit(tx, actor.id, id, "login_created");
      newLogin = true;
    } else if (!login && input.role !== "teacher") {
      throw new UserError("An admin needs an email to sign in.", { email: ["Required for this role."] });
    }
    // deactivating ends every sign-in (they are older than password_changed_at)
    if (login && !input.active && target.active) await tx.update(users).set({ passwordChangedAt: new Date() }).where(eq(users.id, id));

    const { added, removed } = await syncClasses(tx, id, input.classes);
    if (added.length || removed.length) await audit(tx, actor.id, id, "classes", { added, removed });
  });
  return { newLogin };
}

/** Who to send an invite to (an existing login the user may manage), or an error. */
export async function inviteTarget(user: Viewer | null, id: string): Promise<{ email: string; name: string }> {
  const actor = manager(user);
  const [p] = await getDb().select({ role: profiles.role, active: profiles.active, name: profiles.fullName, email: users.email })
    .from(profiles).leftJoin(users, eq(users.id, profiles.id)).where(eq(profiles.id, id));
  if (!p) throw new UserError("That person was not found.");
  if (!canEditPerson(actor.role, { role: p.role })) throw new UserError("You can't change this account.");
  if (!p.email) throw new UserError("Give this person an email first.");
  if (!p.active) throw new UserError("This account is not active.");
  return { email: p.email, name: p.name };
}

export async function logInvite(user: Viewer | null, id: string) {
  const actor = manager(user);
  await getDb().transaction((tx) => audit(tx, actor.id, id, "invite"));
}

/** The last 50 changes, newest first, for the Users page. */
export async function recentAudit(user: Viewer | null) {
  manager(user);
  const actor = sql<string>`(select full_name from profiles p where p.id = ${auditLog.actorId})`;
  const target = sql<string>`(select full_name from profiles p where p.id = ${auditLog.targetId})`;
  return getDb().select({ at: auditLog.createdAt, action: auditLog.action, details: auditLog.details, actor, target })
    .from(auditLog).orderBy(sql`${auditLog.createdAt} desc`).limit(50);
}

/**
 * Fallback when email doesn't work: a temporary password (shown once) that must be changed at the
 * next sign-in. Every existing sign-in of that person ends.
 */
export async function resetToTemporaryPassword(user: Viewer | null, id: string): Promise<string> {
  const actor = manager(user);
  if (id === actor.id) throw new UserError("Change your own password on your Account page.");
  const password = generateTempPassword();
  const hash = await hashPassword(password);
  await getDb().transaction(async (tx) => {
    actor.role = await recheck(tx, actor.id);
    const [p] = await tx.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, id)).for("update");
    if (!p || !canEditPerson(actor.role, { role: p.role })) throw new UserError("You can't change this account.");
    const [login] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).for("update");
    if (!login) throw new UserError("This person has no login yet: add an email first.");
    await tx.update(users).set({ passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: true }).where(eq(users.id, id));
    await audit(tx, actor.id, id, "password_reset");
  });
  return password;
}