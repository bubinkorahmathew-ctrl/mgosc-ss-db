"use server";

import { after } from "next/server";
import { z } from "zod";
import { makeResetLink, redeemResetLink } from "@/lib/authn/session";
import { requestClient } from "@/lib/authn/request";
import { appUrl, sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";
import { takeRateLimit } from "@/lib/repo/rate-limits";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";

/** Always this, whether or not the account exists. */
const SENT = "If an account exists for that email, we've sent a password reset link.";

/** Public. The reply never reveals whether the email has an account, and takes the same time. */
export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  const { email, website } = parsed.data;
  if (website) return { ok: true, message: SENT }; // honeypot

  try {
    const client = await requestClient();
    if (!(await takeRateLimit("password_reset", client.device, client.secret))) return { ok: true, message: SENT };
  } catch (e) {
    console.error("[reset] rate limit check failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  // the lookup and the email run after the response, so its timing says nothing either
  after(async () => {
    try {
      const link = await makeResetLink(email);
      if (!link) return;
      const url = `${appUrl()}/reset-password?token=${link.token}`;
      await sendEmail({ to: link.email, ...passwordResetEmail({ name: link.name, link: url }) });
    } catch (e) {
      console.error("[reset] could not send the reset email:", e instanceof Error ? e.message : e);
    }
  });
  return { ok: true, message: SENT };
}

const resetInput = resetPasswordSchema.and(z.object({ token: z.string().max(100) }));

/** Public: sets the new password from an emailed link. */
export async function resetPassword(input: unknown): Promise<ActionResult> {
  try {
    const { token, password } = resetInput.parse(input);
    if (!(await redeemResetLink(token, password))) {
      return { ok: false, error: "This link is invalid, already used or expired. Please ask for a new one." };
    }
    return { ok: true, message: "Your password has been changed. You can sign in now." };
  } catch (e) {
    return toActionError(e);
  }
}
