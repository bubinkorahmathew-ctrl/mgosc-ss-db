"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { makeInviteLink } from "@/lib/authn/session";
import { appUrl, sendEmail } from "@/lib/email/send";
import { inviteEmail } from "@/lib/email/templates";
import * as people from "@/lib/repo/users";
import { uuid } from "@/lib/validation/common";
import { personSchema } from "@/lib/validation/users";
import { toActionError, type ActionResult } from "@/lib/action-result";

function refresh() {
  for (const p of ["/admin/users", "/admin/classes", "/admin/rights", "/admin"]) revalidatePath(p);
}

/** Emails a "Set your password" link (48 hours). Returns a message for the admin. */
async function sendInvite(email: string, name: string): Promise<string> {
  const link = await makeInviteLink(email);
  if (!link) return "No invite sent: three links were already sent in the last hour. Try again later.";
  try {
    await sendEmail({ to: link.email, ...inviteEmail({ name, link: `${appUrl()}/reset-password?token=${link.token}` }) });
    return `Invite emailed to ${link.email}.`;
  } catch (e) {
    console.error("[users] invite email failed:", e instanceof Error ? e.message : e);
    return "The account is ready but the invite email could not be sent. Use “Resend invite”, or “Reset password” for a temporary password.";
  }
}

export async function savePerson(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertRole("admin");
    const { id, ...data } = personSchema.parse(input);
    if (id) {
      const { newLogin } = await people.updatePerson(user, id, data);
      const note = newLogin && data.email ? ` ${await sendInvite(data.email, data.full_name)}` : "";
      refresh();
      return { ok: true, data: { id }, message: `Saved.${note}` };
    }
    const made = await people.createPerson(user, data);
    const note = made.login && data.email ? ` ${await sendInvite(data.email, data.full_name)}` : " No login yet: add an email to invite them.";
    if (made.login) after(() => people.logInvite(user, made.id).catch(() => {}));
    refresh();
    return { ok: true, data: { id: made.id }, message: `Created.${note}` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resendInvite(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    const { id } = z.object({ id: uuid }).parse(input);
    const target = await people.inviteTarget(user, id);
    const message = await sendInvite(target.email, target.name);
    await people.logInvite(user, id);
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

/** Temporary password, shown once (the fallback when email doesn't work). */
export async function resetPersonPassword(input: unknown): Promise<ActionResult<{ password: string }>> {
  try {
    const user = await assertRole("admin");
    const { id } = z.object({ id: uuid }).parse(input);
    const password = await people.resetToTemporaryPassword(user, id);
    return { ok: true, data: { password }, message: "Temporary password made." };
  } catch (e) {
    return toActionError(e);
  }
}