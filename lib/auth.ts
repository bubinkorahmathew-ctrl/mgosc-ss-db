import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/authn/login";
import { sessionUser } from "@/lib/authn/session";
import { auth } from "@/lib/authn/next-auth";
import { CHANGE_PASSWORD, homeFor } from "@/lib/authn/routes";
import type { UserRole } from "@/lib/db/types";

export type CurrentUser = SessionUser;
export { homeFor };

/**
 * The signed-in user, checked against the database (active, password not changed since sign-in).
 * Includes users who still have to replace a temporary password: only the change-password page
 * should use this directly. Cached per render.
 */
export const getSignedInUser = cache(async (): Promise<CurrentUser | null> => {
  return sessionUser(await auth());
});

/**
 * The signed-in user who may use the app: null when signed out, expired, deactivated, or still
 * holding a temporary password.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await getSignedInUser();
  return user && !user.mustChangePassword ? user : null;
});

/** For pages/layouts: redirect unless the user has the role. */
export async function requireRole(role: UserRole): Promise<CurrentUser> {
  const user = await getSignedInUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect(CHANGE_PASSWORD);
  if (user.profile.role !== role) redirect(homeFor(user.profile.role));
  return user;
}

export class AuthError extends Error {
  constructor(message = "You are not allowed to do that.") {
    super(message);
  }
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function assertRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.profile.role)) throw new AuthError();
  return user;
}

/** School settings and admin accounts. */
export async function assertSuperAdmin(): Promise<CurrentUser> {
  const user = await assertRole("headmaster");
  if (!user.superAdmin) throw new AuthError("Only a super admin can do that.");
  return user;
}
