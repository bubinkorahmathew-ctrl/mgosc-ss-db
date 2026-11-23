import "server-only";
/**
 * Teacher logins. Replaces the Supabase Auth admin API.
 * Each function checks "active headmaster" itself, inside its own transaction, and can only
 * ever act on a teacher, never on a headmaster.
 */
import { randomUUID } from "node:crypto";
import type { Database, Executor } from "@/lib/db/connection";
import { DbError, notAllowed } from "@/lib/db/errors";
import { lockActor } from "@/lib/db/policies";
import { validateRows } from "@/lib/db/rules";
import { toId } from "@/lib/db/values";
import { generateTempPassword } from "@/lib/password";
import { hashPassword } from "./password";

const NO_FACTS = { studentClass: new Map(), examClass: new Map() };

async function requireHeadmaster(tx: Executor, actorId: string) {
  const actor = await lockActor(tx, toId(actorId));
  if (!actor.headmaster) throw notAllowed();
}

async function lockTeacher(tx: Executor, teacherId: string) {
  const [target] = await tx.query<{ role: string; active: number }>(
    "select role, active from profiles where id = ? for update", [teacherId]);
  if (target?.role !== "teacher") throw notAllowed("not allowed: not a teacher");
  return target;
}

/** Replaces the CURRENT year's assignments only. Past years are history and are kept. */
async function syncClasses(tx: Executor, teacherId: string, classIds: string[]) {
  const current = new Set((await tx.query<{ id: string }>(
    `select c.id from classes c join academic_years y on y.id = c.academic_year_id
      where y.is_current for update`)).map((c) => c.id));
  const want = new Set(classIds.map(toId));
  if ([...want].some((id) => !current.has(id))) throw notAllowed("not allowed: class is not in the current year");

  const assigned = await tx.query<{ class_id: string }>(
    "select class_id from class_teachers where teacher_id = ? for update", [teacherId]);
  const have = new Set(assigned.map((r) => r.class_id));
  const remove = [...have].filter((id) => current.has(id) && !want.has(id));
  const add = [...want].filter((id) => !have.has(id));
  if (remove.length) await tx.query("delete from class_teachers where teacher_id = ? and class_id in (?)", [teacherId, remove]);
  if (add.length) await tx.query("insert into class_teachers (class_id, teacher_id) values ?", [add.map((id) => [id, teacherId])]);
}

type TeacherDetails = { full_name: string; phone: string | null; class_ids: string[] };

/** Login, profile and classes are created together or not at all. */
export async function createTeacherAccount(
  database: Database, actorId: string, input: TeacherDetails & { email: string },
): Promise<{ id: string; password: string }> {
  const password = generateTempPassword();
  const hash = await hashPassword(password);
  const id = randomUUID();
  await database.transaction(async (tx) => {
    await requireHeadmaster(tx, actorId);
    const [taken] = await tx.query("select id from users where email = ? for update", [input.email]);
    if (taken) throw new DbError("duplicate key: email already exists", "23505");
    await validateRows(tx, "profiles", [{ full_name: input.full_name }], NO_FACTS, null);
    await tx.query("insert into profiles (id, full_name, phone, role) values (?, ?, ?, 'teacher')",
      [id, input.full_name, input.phone]);
    await tx.query("insert into users (id, email, password_hash) values (?, ?, ?)", [id, input.email, hash]);
    await syncClasses(tx, id, input.class_ids);
  });
  return { id, password };
}

export async function updateTeacherAccount(
  database: Database, actorId: string, teacherId: string, input: TeacherDetails,
): Promise<void> {
  const id = toId(teacherId);
  await database.transaction(async (tx) => {
    await requireHeadmaster(tx, actorId);
    await lockTeacher(tx, id);
    await validateRows(tx, "profiles", [{ full_name: input.full_name }], NO_FACTS, null);
    await tx.query("update profiles set full_name = ?, phone = ? where id = ?", [input.full_name, input.phone, id]);
    await syncClasses(tx, id, input.class_ids);
  });
}

export async function setTeacherAccountActive(
  database: Database, actorId: string, teacherId: string, active: boolean,
): Promise<void> {
  const id = toId(teacherId);
  await database.transaction(async (tx) => {
    await requireHeadmaster(tx, actorId);
    await lockTeacher(tx, id);
    await tx.query("update profiles set active = ? where id = ?", [active, id]);
    // deleted, not just blocked, so re-activation doesn't revive an old device's session
    if (!active) await tx.query("delete from sessions where user_id = ?", [id]);
  });
}

/** Returns the new temporary password (shown once) and signs the teacher out everywhere. */
export async function resetTeacherAccountPassword(database: Database, actorId: string, teacherId: string): Promise<string> {
  const id = toId(teacherId);
  const password = generateTempPassword();
  const hash = await hashPassword(password);
  await database.transaction(async (tx) => {
    await requireHeadmaster(tx, actorId);
    await lockTeacher(tx, id);
    const [login] = await tx.query("select id from users where id = ? for update", [id]);
    if (!login) throw new DbError("this teacher has no login", "P0001");
    await tx.query("update users set password_hash = ?, password_changed_at = ? where id = ?", [hash, new Date(), id]);
    await tx.query("delete from sessions where user_id = ?", [id]);
  });
  return password;
}

/** Emails live outside profiles, and only the headmaster may list them. */
export async function listTeacherEmails(database: Database, actorId: string): Promise<Map<string, string>> {
  const rows = await database.query<{ id: string; email: string }>(
    `select u.id, u.email from users u join profiles p on p.id = u.id
      where p.role = 'teacher'
        and exists (select 1 from profiles me where me.id = ? and me.active and me.role = 'headmaster')`,
    [toId(actorId)]);
  return new Map(rows.map((r) => [r.id, r.email]));
}
