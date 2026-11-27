"use server";

import { redirect } from "next/navigation";
import { CredentialsSignin } from "next-auth";
import { AuthError, getSignedInUser } from "@/lib/auth";
import { changePasswordFor, findLoginTarget } from "@/lib/authn/session";
import { signIn as authSignIn, signOut as authSignOut } from "@/lib/authn/next-auth";
import { requestClient } from "@/lib/authn/request";
import { CHANGE_PASSWORD, homeFor } from "@/lib/authn/routes";
import { changePasswordSchema, safeNext, signInSchema } from "@/lib/validation/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";

// Deliberately vague: the message never says whether the email exists.
const FAILED: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  limited: "Too many failed attempts. Please wait 15 minutes and try again.",
  inactive: "This account is not active. Please contact the headmaster.",
};

export async function signIn(input: unknown): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter your email and password." };
  const { email, password, next, remember } = parsed.data;

  let target: string;
  try {
    await authSignIn("credentials", { email, password, remember: String(remember), redirect: false });
    const who = await findLoginTarget(email);
    if (!who) return { ok: false, error: FAILED.invalid };
    const home = homeFor(who.role);
    const wanted = safeNext(next);
    // only follow ?next= inside the user's own area
    target = who.mustChangePassword ? CHANGE_PASSWORD : wanted?.startsWith(home) ? wanted : home;
  } catch (e) {
    if (e instanceof CredentialsSignin) return { ok: false, error: FAILED[e.code] ?? FAILED.invalid };
    console.error("sign-in failed", e instanceof Error ? e.message : "unknown error");
    return { ok: false, error: "Sign in is unavailable right now. Please try again." };
  }
  redirect(target);
}

export async function signOut() {
  await authSignOut({ redirectTo: "/login" });
}

/**
 * Own password, for every role, including the forced change after a temporary password.
 * Signs out every other device; this one is signed in again with the new password.
 */
export async function changeOwnPassword(input: unknown): Promise<ActionResult<{ home: string }>> {
  try {
    const user = await getSignedInUser();
    if (!user) throw new AuthError("Please sign in again.");
    const { current, password } = changePasswordSchema.parse(input);

    const result = await changePasswordFor(user.id, current, password, await requestClient());
    if (!result.ok) {
      if (result.reason === "limited") return { ok: false, error: FAILED.limited };
      return { ok: false, error: "Current password is incorrect.", fieldErrors: { current: ["Current password is incorrect."] } };
    }
    await authSignIn("credentials", { email: result.email, password, redirect: false });
    return { ok: true, data: { home: homeFor(user.profile.role) }, message: "Password changed." };
  } catch (e) {
    return toActionError(e);
  }
}
