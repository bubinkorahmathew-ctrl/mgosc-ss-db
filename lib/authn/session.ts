import "server-only";
import { getDb } from "@/db/client";
import { changeOwnPassword, loginTarget, loadSessionUser, type Client, type SessionClaims, type SessionUser } from "./login";

/** The user behind an Auth.js session ({ user.id, authAt }), checked against the database. */
export function sessionUser(session: unknown): Promise<SessionUser | null> {
  const s = session as { user?: { id?: string }; authAt?: number; remember?: boolean } | null | undefined;
  if (!s?.user?.id) return Promise.resolve(null);
  return loadSessionUser(getDb(), { id: s.user.id, authAt: s.authAt, remember: s.remember } as Partial<SessionClaims>);
}

/** Right after a successful sign-in: where to send this person. */
export const findLoginTarget = (email: string) => loginTarget(getDb(), email);

/** The signed-in user's own password change (see changeOwnPassword). */
export const changePasswordFor = (userId: string, current: string, next: string, client: Client) =>
  changeOwnPassword(getDb(), userId, current, next, client);