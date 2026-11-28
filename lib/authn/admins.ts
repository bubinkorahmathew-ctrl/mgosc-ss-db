import "server-only";
/**
 * Admin logins. Super admin only, and they can only ever act on a plain admin:
 * never on a super admin (that is what `npm run super-admin` is for).
 */
import { randomUUID } from "node:crypto";
import type { Database, Executor } from "@/lib/db/connection";
import { DbError, notAllowed } from "@/lib/db/errors";
import { lockActor } from "@/lib/db/policies";
import { toId } from "@/lib/db/values";
import { generateTempPassword } from "@/lib/password";
import { hashPassword } from "./password";

async function requireSuperAdmin(tx: Executor, actorId: string) {
  if (!(await lockActor(tx, toId(actorId))).superAdmin) throw notAllowed();
}

async function lockAdmin(tx: Executor, id: string) {
  const [target] = await tx.query<{ role: string; is_super: number }>(
    "select role, is_super from profiles where id = ? for update", [id]);
  if (target?.role !== "headmaster" || target.is_super) throw notAllowed("not allowed: not an admin");
}

export type AdminAccount = { id: string; full_name: string; email: string; active: boolean; superAdmin: boolean };

export async function listAdminAccounts(database: Database, actorId: string): Promise<AdminAccount[]> {
  const rows = await database.query<{ id: string; full_name: string; email: string; active: number; is_super: number }>(
    `select p.id, p.full_name, u.email, p.active, p.is_super from profiles p join users u on u.id = p.id
      where p.role = 'headmaster'
        and exists (select 1 from profiles me where me.id = ? and me.active and me.role = 'headmaster' and me.is_super)
      order by p.is_super desc, p.active desc, lower(p.full_name)`,
    [toId(actorId)]);
  return rows.map(({ is_super, active, ...r }) => ({ ...r, active: Boolean(active), superAdmin: Boolean(is_super) }));
}

export async function createAdminAccount(
  database: Database, actorId: string, input: { email: string; full_name: string },
): Promise<string> {
  const password = generateTempPassword();
  const hash = await hashPassword(password);
  const id = randomUUID();
  await database.transaction(async (tx) => {
    await requireSuperAdmin(tx, actorId);
    const [taken] = await tx.query("select id from users where email = ? for update", [input.email]);
    if (taken) throw new DbError("duplicate key: email already exists", "23505");
    await tx.query("insert into profiles (id, full_name, role) values (?, ?, 'headmaster')", [id, input.full_name]);
    await tx.query("insert into users (id, email, password_hash, password_changed_at, must_change_password) values (?, ?, ?, ?, true)", [id, input.email, hash, new Date()]);
  });
  return password;
}

export async function setAdminAccountActive(database: Database, actorId: string, adminId: string, active: boolean) {
  const id = toId(adminId);
  await database.transaction(async (tx) => {
    await requireSuperAdmin(tx, actorId);
    await lockAdmin(tx, id);
    await tx.query("update profiles set active = ? where id = ?", [active, id]);
    // sign-ins older than password_changed_at are refused: re-activating later doesn't revive them
    if (!active) await tx.query("update users set password_changed_at = ? where id = ?", [new Date(), id]);
  });
}

/**
 * Teacher -> admin or admin -> teacher, keeping the same login and password. Super admin only;
 * never the super admin's own account or the caller's. Class assignments are kept (an admin sees
 * every class anyway; a teacher made again gets their classes back). Takes effect on the next
 * request: the role is read from the database every time.
 */
export async function setStaffRole(database: Database, actorId: string, targetId: string, role: "headmaster" | "teacher") {
  const id = toId(targetId);
  await database.transaction(async (tx) => {
    await requireSuperAdmin(tx, actorId);
    if (id === toId(actorId)) throw notAllowed("not allowed: you can't change your own role");
    const [target] = await tx.query<{ role: string; is_super: number }>(
      "select role, is_super from profiles where id = ? for update", [id]);
    if (!target || target.is_super) throw notAllowed("not allowed: that account can't be changed");
    const from = role === "headmaster" ? "teacher" : "headmaster";
    if (target.role !== from) throw notAllowed(`not allowed: that account is not ${from === "teacher" ? "a teacher" : "an admin"}`);
    await tx.query("update profiles set role = ? where id = ?", [role, id]);
  });
}

export async function resetAdminAccountPassword(database: Database, actorId: string, adminId: string): Promise<string> {
  const id = toId(adminId);
  const password = generateTempPassword();
  const hash = await hashPassword(password);
  await database.transaction(async (tx) => {
    await requireSuperAdmin(tx, actorId);
    await lockAdmin(tx, id);
    await tx.query("update users set password_hash = ?, password_changed_at = ?, must_change_password = true where id = ?", [hash, new Date(), id]);
  });
  return password;
}
