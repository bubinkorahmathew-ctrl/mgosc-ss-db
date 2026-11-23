/**
 * Who may read and write which rows. This replaces the 35 row level security policies of
 * supabase/migrations: TiDB has no RLS, so this file is the security boundary.
 *
 * Default deny: an operation that is not listed here is refused.
 *
 * Roles (changed at the school's request after the Postgres port):
 *   super admin  everything
 *   admin        all school work, but not settings, and no other admin's profile
 *   teacher      own classes: add students; record attendance, marks, activities.
 *                They see their classes' certificates but only admins issue them.
 *
 * Deliberately stricter than Postgres was, for deactivated accounts only: they can still read
 * their own profile (to show "account not active") but no longer reference data, and cannot
 * edit their profile.
 */
import type { Executor } from "./connection";
import type { TableName } from "./schema";
import type { Row } from "./values";

export type Sql = { sql: string; params: unknown[] };
export const NONE: Sql = { sql: "1=0", params: [] };
export const ALL: Sql = { sql: "1=1", params: [] };

/** Reachable only through system.ts, whoever the caller is. */
export const INTERNAL_TABLES: ReadonlySet<TableName> = new Set<TableName>(["registration_attempts", "number_counters"]);

// ---------------------------------------------------------------------------------------------
// Reading: a single statement, so role, active flag and assignments are always current
// ---------------------------------------------------------------------------------------------

const IS_HEADMASTER = "exists (select 1 from profiles me where me.id = ? and me.active and me.role = 'headmaster')";
const IS_ACTIVE = "exists (select 1 from profiles me where me.id = ? and me.active)";
const MY_CLASSES =
  "select mine.class_id from class_teachers mine join profiles me on me.id = mine.teacher_id where mine.teacher_id = ? and me.active";

/** Extra rows visible to a non-headmaster. Every ? is the caller's id. `t` is the table being read. */
const VISIBLE: Partial<Record<TableName, string>> = {
  profiles: `t.id = ? or t.id in (select co.teacher_id from class_teachers co where co.class_id in (${MY_CLASSES}))`,
  academic_years: IS_ACTIVE,
  subjects: IS_ACTIVE,
  school_settings: IS_ACTIVE,
  classes: `t.id in (${MY_CLASSES})`,
  class_teachers: `t.class_id in (${MY_CLASSES})`,
  students: `t.class_id in (${MY_CLASSES})`,
  exams: `t.class_id in (${MY_CLASSES})`,
  marks: `t.exam_id in (select e.id from exams e where e.class_id in (${MY_CLASSES}))`,
  attendance: `t.class_id in (${MY_CLASSES})`,
  activities: `t.class_id in (${MY_CLASSES})`,
  certificates: `t.class_id in (${MY_CLASSES}) or t.student_id in (select s.id from students s where s.class_id in (${MY_CLASSES}))`,
  // registrations: headmaster only
};

export function readable(table: TableName, userId: string | null): Sql {
  if (!userId || INTERNAL_TABLES.has(table)) return NONE;
  const extra = VISIBLE[table];
  const sql = extra ? `(${IS_HEADMASTER} or (${extra}))` : IS_HEADMASTER;
  return { sql, params: Array<string>(sql.split("?").length - 1).fill(userId) };
}

// ---------------------------------------------------------------------------------------------
// Writing: the caller is loaded and locked inside the write's own transaction
// ---------------------------------------------------------------------------------------------

export type Actor = {
  id: string | null;
  /** admin or super admin */
  headmaster: boolean;
  superAdmin: boolean;
  active: boolean;
  classes: ReadonlySet<string>;
};

/**
 * The locks make revocation immediate: a write cannot commit on a role, active flag or class
 * assignment that was removed before it started.
 */
export async function lockActor(tx: Executor, userId: string | null): Promise<Actor> {
  const nobody: Actor = { id: null, headmaster: false, superAdmin: false, active: false, classes: new Set() };
  if (!userId) return nobody;
  const [profile] = await tx.query<{ role: string; active: number; is_super: number }>(
    "select role, active, is_super from profiles where id = ? for update", [userId]);
  if (!profile?.active) return nobody;
  const assigned = await tx.query<{ class_id: string }>(
    "select class_id from class_teachers where teacher_id = ? for update", [userId]);
  return {
    id: userId,
    headmaster: profile.role === "headmaster",
    superAdmin: profile.role === "headmaster" && Boolean(profile.is_super),
    active: true,
    classes: new Set(assigned.map((r) => r.class_id)),
  };
}

/** What the write rules need to know about the rows being referenced. */
export type Facts = { studentClass: Map<string, string | null>; examClass: Map<string, string> };

const inMine = (actor: Actor, classId: unknown) => typeof classId === "string" && actor.classes.has(classId);
const teaches = (actor: Actor, facts: Facts, studentId: unknown) =>
  inMine(actor, facts.studentClass.get(studentId as string));

/** WITH CHECK: may the caller leave this row in this state? */
export function canWrite(op: "insert" | "update", table: TableName, row: Row, actor: Actor, facts: Facts): boolean {
  if (INTERNAL_TABLES.has(table)) return false;
  // anyone, signed in or not, may submit a registration; rules.ts forces it to pending
  if (op === "insert" && table === "registrations") return true;
  if (!actor.active) return false;
  if (actor.superAdmin) return true;
  if (actor.headmaster) {
    if (table === "school_settings") return false;
    // an admin manages teachers and their own profile, and creates no logins by hand
    if (table === "profiles") return op === "update" && (row.role === "teacher" || row.id === actor.id);
    return true;
  }

  switch (table) {
    case "students":
      // teachers add to their own classes; editing, moving and removing stay with admins
      return op === "insert" && inMine(actor, row.class_id) && row.status === "active";
    case "profiles":
      return op === "update" && row.id === actor.id;
    case "marks":
      return inMine(actor, facts.examClass.get(row.exam_id as string)) && teaches(actor, facts, row.student_id);
    case "attendance":
      return inMine(actor, row.class_id) && teaches(actor, facts, row.student_id);
    case "activities":
      return inMine(actor, row.class_id) && (row.student_id == null || teaches(actor, facts, row.student_id));
    default:
      return false;
  }
}

/** USING: which existing rows may the caller update or delete? Other rows are silently not matched. */
export function targetable(op: "update" | "delete", table: TableName, actor: Actor): Sql {
  if (!actor.active || INTERNAL_TABLES.has(table)) return NONE;
  if (actor.superAdmin) return ALL;
  if (actor.headmaster) {
    if (table === "school_settings") return NONE;
    if (table !== "profiles") return ALL;
    return op === "delete"
      ? { sql: "t.role = 'teacher'", params: [] }
      : { sql: "(t.role = 'teacher' or t.id = ?)", params: [actor.id] };
  }
  if (op === "delete") return NONE; // teachers never delete
  if (table === "profiles") return { sql: "t.id = ?", params: [actor.id] };
  if (!actor.classes.size) return NONE;
  const mine = [[...actor.classes]];
  switch (table) {
    case "marks":
      return { sql: "t.exam_id in (select e.id from exams e where e.class_id in (?))", params: mine };
    case "attendance":
    case "activities":
      return { sql: "t.class_id in (?)", params: mine };
    default:
      return NONE;
  }
}
