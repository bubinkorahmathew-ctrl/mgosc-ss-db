import "server-only";
/**
 * The super admin account. Used only by scripts/headmaster.ts, i.e. by someone who already holds the database password.
 * Never import this from app code.
 */
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/db/connection";
import { DbError, notAllowed } from "@/lib/db/errors";
import { hashPassword } from "./password";

export async function findHeadmasters(database: Database) {
  return database.query<{ id: string; email: string; full_name: string }>(
    `select p.id, u.email, p.full_name from profiles p join users u on u.id = p.id
      where p.role = 'headmaster' and p.is_super order by u.email`);
}

export async function createFirstHeadmaster(
  database: Database, input: { email: string; full_name: string; password: string },
): Promise<string> {
  const hash = await hashPassword(input.password);
  const id = randomUUID();
  await database.transaction(async (tx) => {
    // the single settings row is the mutex: two runs at once can't both create one
    const [lock] = await tx.query("select id from school_settings where id = 1 for update");
    if (!lock) throw new DbError("school_settings is missing: run the migrations first", "P0001");
    const existing = await tx.query("select id from profiles where role = 'headmaster' and is_super for update");
    if (existing.length) throw notAllowed("a super admin already exists");
    await tx.query("insert into profiles (id, full_name, role, is_super) values (?, ?, 'headmaster', true)", [id, input.full_name]);
    await tx.query("insert into users (id, email, password_hash) values (?, ?, ?)", [id, input.email, hash]);
  });
  return id;
}

/** Forgotten headmaster password: also re-activates the account and signs out every device. */
export async function resetHeadmasterPassword(database: Database, email: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await database.transaction(async (tx) => {
    const [found] = await tx.query<{ id: string }>("select id from users where email = ?", [email]);
    if (!found) throw new DbError("no account has that email", "P0001");
    const [profile] = await tx.query<{ role: string; is_super: number }>("select role, is_super from profiles where id = ? for update", [found.id]);
    if (profile?.role !== "headmaster" || !profile.is_super) throw notAllowed("that account is not a super admin");
    await tx.query("update profiles set active = true where id = ?", [found.id]);
    await tx.query("update users set password_hash = ?, password_changed_at = ? where id = ?", [hash, new Date(), found.id]);
    await tx.query("delete from sessions where user_id = ?", [found.id]);
  });
}
