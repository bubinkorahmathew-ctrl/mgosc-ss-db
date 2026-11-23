"use server";

import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth";
import { signInWithPassword } from "@/lib/authn/login";
import { clearSessionCookie, readSessionToken, requestClient, setSessionCookie } from "@/lib/authn/request";
import { endSession } from "@/lib/authn/session";
import { getDatabase } from "@/lib/db";
import { safeNext, signInSchema } from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/action-result";

const FAILED = {
  wrong: "Email or password is incorrect.",
  limited: "Too many attempts. Please wait 15 minutes and try again.",
  inactive: "This account is not active. Please contact the headmaster.",
} as const;

export async function signIn(input: unknown): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter your email and password." };
  const { email, password, next } = parsed.data;

  let home: string;
  try {
    const database = getDatabase();
    const result = await signInWithPassword(database, email, password, await requestClient());
    if (!result.ok) return { ok: false, error: FAILED[result.reason] };
    await endSession(database, await readSessionToken()); // whatever this browser had before
    await setSessionCookie(result.session);
    home = homeFor(result.role);
  } catch (e) {
    console.error("sign-in failed", e instanceof Error ? e.message : "unknown error");
    return { ok: false, error: "Sign in is unavailable right now. Please try again." };
  }

  const target = safeNext(next);
  // only follow ?next= inside the user's own area
  redirect(target && target.startsWith(home) ? target : home);
}

export async function signOut() {
  const token = await readSessionToken();
  await clearSessionCookie();
  await endSession(getDatabase(), token);
  redirect("/login");
}
