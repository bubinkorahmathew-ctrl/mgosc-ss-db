/** Which pages each role may open. Pure, so proxy.ts and the tests share it. */
import type { UserRole } from "@/lib/db/types";
import { hasRole, isAdmin, type RoleGuard } from "@/lib/permissions";

export const CHANGE_PASSWORD = "/change-password";

export function homeFor(role: UserRole) {
  return isAdmin(role) ? "/admin" : role === "ovbs_teacher" ? "/ovbs" : "/teacher";
}

const AREAS: [RegExp, RoleGuard][] = [
  [/^\/admin(\/|$)/, "admin"],
  [/^\/teacher(\/|$)/, "teacher"],
  [/^\/ovbs(\/|$)/, "ovbs_teacher"],
];

/** Signed-in user as far as routing cares; null when signed out or the sign-in is no longer valid. */
export type RouteUser = { role: UserRole; mustChangePassword: boolean } | null;

/** Where to send this request instead, or null to let it through. */
export function redirectFor(path: string, user: RouteUser): string | null {
  const area = AREAS.find(([pattern]) => pattern.test(path))?.[1];
  if (!user) {
    if (area) return `/login?next=${encodeURIComponent(path)}`;
    return path === CHANGE_PASSWORD ? "/login" : null;
  }
  // a temporary password must be replaced before anything else
  if (user.mustChangePassword) return path === CHANGE_PASSWORD ? null : CHANGE_PASSWORD;
  const home = homeFor(user.role);
  if (path === "/login" || path === CHANGE_PASSWORD) return home;
  if (area && !hasRole(user.role, area)) return home;
  return null;
}
