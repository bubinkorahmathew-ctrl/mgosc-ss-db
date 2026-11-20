import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, UserRole } from "@/lib/supabase/types";

export type CurrentUser = { id: string; email: string | null; profile: ProfileRow };

/**
 * The signed-in user plus their profile, verified against Supabase Auth.
 * Cached per request. Returns null when signed out, deactivated, or without a profile.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.active) return null;
  return { id: data.user.id, email: data.user.email ?? null, profile };
});

/** For pages/layouts: redirect unless the user has the role. */
export async function requireRole(role: UserRole): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?reason=inactive");
  if (user.profile.role !== role) redirect(homeFor(user.profile.role));
  return user;
}

export function homeFor(role: UserRole) {
  return role === "headmaster" ? "/admin" : "/teacher";
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

/** Class ids the current user may work with (all classes for headmaster). */
export async function accessibleClassIds(user: CurrentUser): Promise<string[] | "all"> {
  if (user.profile.role === "headmaster") return "all";
  const supabase = await createClient();
  const { data } = await supabase.from("class_teachers").select("class_id").eq("teacher_id", user.id);
  return (data ?? []).map((r) => r.class_id);
}

/** Server-side re-check of class ownership (on top of RLS). */
export async function assertClassAccess(user: CurrentUser, classId: string) {
  const ids = await accessibleClassIds(user);
  if (ids !== "all" && !ids.includes(classId)) throw new AuthError("That class is not assigned to you.");
}
