import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Database, Executor } from "@/lib/db/connection";
import { fromDb, type Row } from "@/lib/db/values";
import type { ProfileRow } from "@/lib/db/types";

export const SESSION_DAYS = 14;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type NewSession = { token: string; expires: Date };
export type SessionUser = { id: string; email: string; superAdmin: boolean; profile: ProfileRow };

/** Call only inside a transaction that has locked and checked the account. */
export async function insertSession(tx: Executor, userId: string, now: Date): Promise<NewSession> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await tx.query("insert into sessions (token_hash, user_id, created_at, expires_at) values (?, ?, ?, ?)",
    [hashToken(token), userId, now, expires]);
  return { token, expires };
}

/** Looked up on every request, so sign-out, reset and deactivation take effect immediately. */
export async function resolveSession(
  database: Executor, token: string | undefined, now = new Date(),
): Promise<SessionUser | null> {
  if (!token || !TOKEN.test(token)) return null;
  const [row] = await database.query<Row & { email: string; is_super: number }>(
    `select u.email, p.is_super, p.id, p.full_name, p.phone, p.role, p.active, p.created_at
       from sessions s join users u on u.id = s.user_id join profiles p on p.id = u.id
      where s.token_hash = ? and s.expires_at > ? and p.active`,
    [hashToken(token), now]);
  if (!row) return null;
  const { email, is_super, ...profile } = row;
  const user = fromDb("profiles", profile) as ProfileRow;
  return { id: user.id, email, superAdmin: user.role === "headmaster" && Boolean(is_super), profile: user };
}

export async function endSession(database: Database, token: string | undefined): Promise<void> {
  if (!token || !TOKEN.test(token)) return;
  await database.query("delete from sessions where token_hash = ?", [hashToken(token)]);
}
