import "server-only";
import type { Database } from "@/lib/db/connection";
import type { UserRole } from "@/lib/db/types";
import { hashPassword, verifyPassword } from "./password";
import { insertSession, type NewSession } from "./session";
import { beginAttempt } from "./throttle";

export type Client = { ip: string; salt: string };
type Failure<R extends string> = { ok: false; reason: R };

export async function signInWithPassword(
  database: Database, email: string, password: string, client: Client,
): Promise<{ ok: true; role: UserRole; session: NewSession } | Failure<"limited" | "wrong" | "inactive">> {
  const attempt = await beginAttempt(database, email, client.ip, client.salt);
  if (!attempt.allowed) return { ok: false, reason: "limited" };

  const [account] = await database.query<{ id: string; password_hash: string }>(
    "select id, password_hash from users where email = ?", [email]);
  if (!(await verifyPassword(password, account?.password_hash))) return { ok: false, reason: "wrong" };
  await attempt.succeeded();

  return database.transaction(async (tx) => {
    // Lock order everywhere: profiles, users, sessions.
    const [profile] = await tx.query<{ role: UserRole; active: number }>(
      "select role, active from profiles where id = ? for update", [account.id]);
    const [current] = await tx.query<{ password_hash: string }>(
      "select password_hash from users where id = ? for update", [account.id]);
    // reset while we were hashing: the old password must not produce a session
    if (current?.password_hash !== account.password_hash) return { ok: false, reason: "wrong" } as const;
    if (!profile?.active) return { ok: false, reason: "inactive" } as const;
    return { ok: true, role: profile.role, session: await insertSession(tx, account.id, new Date()) } as const;
  });
}

/** Signs out every device and returns a fresh session for this one. */
export async function changePassword(
  database: Database, userId: string, current: string, next: string, client: Client,
): Promise<{ ok: true; session: NewSession } | Failure<"limited" | "wrong">> {
  const attempt = await beginAttempt(database, `change:${userId}`, client.ip, client.salt);
  if (!attempt.allowed) return { ok: false, reason: "limited" };

  const [account] = await database.query<{ password_hash: string }>("select password_hash from users where id = ?", [userId]);
  if (!(await verifyPassword(current, account?.password_hash))) return { ok: false, reason: "wrong" };
  await attempt.succeeded();
  const hash = await hashPassword(next);

  return database.transaction(async (tx) => {
    const [profile] = await tx.query<{ active: number }>("select active from profiles where id = ? for update", [userId]);
    const [locked] = await tx.query<{ password_hash: string }>("select password_hash from users where id = ? for update", [userId]);
    if (!profile?.active || locked?.password_hash !== account.password_hash) return { ok: false, reason: "wrong" } as const;
    const now = new Date();
    await tx.query("update users set password_hash = ?, password_changed_at = ? where id = ?", [hash, now, userId]);
    await tx.query("delete from sessions where user_id = ?", [userId]);
    return { ok: true, session: await insertSession(tx, userId, now) } as const;
  });
}
