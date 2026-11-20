"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";
import { safeNext, signInSchema } from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/action-result";

export async function signIn(input: unknown): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter your email and password." };
  const { email, password, next } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: "Email or password is incorrect." };
  }

  const { data: profile } = await supabase
    .from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return { ok: false, error: "This account is not active. Please contact the headmaster." };
  }

  const home = homeFor(profile.role);
  const target = safeNext(next);
  // only follow ?next= inside the user's own area
  redirect(target && target.startsWith(home) ? target : home);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
