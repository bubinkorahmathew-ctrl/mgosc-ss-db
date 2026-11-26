"use server";

import { revalidatePath } from "next/cache";
import { assertSuperAdmin } from "@/lib/auth";
import * as accounts from "@/lib/repo/accounts";
import { createAdminSchema, teacherIdSchema } from "@/lib/validation/staff";
import { toActionError, type ActionResult } from "@/lib/action-result";

export async function createAdmin(input: unknown): Promise<ActionResult<{ email: string; password: string }>> {
  try {
    const user = await assertSuperAdmin();
    const details = createAdminSchema.parse(input);
    const password = await accounts.createAdmin(user, details);
    revalidatePath("/admin/admins");
    return { ok: true, data: { email: details.email, password }, message: "Admin account created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setAdminActive(input: unknown, active: boolean): Promise<ActionResult> {
  try {
    const user = await assertSuperAdmin();
    const { id } = teacherIdSchema.parse(input);
    const on = active === true;
    await accounts.setAdminActive(user, id, on);
    revalidatePath("/admin/admins");
    return { ok: true, message: on ? "Admin re-activated." : "Admin deactivated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetAdminPassword(input: unknown): Promise<ActionResult<{ password: string }>> {
  try {
    const user = await assertSuperAdmin();
    const password = await accounts.resetAdminPassword(user, teacherIdSchema.parse(input).id);
    return { ok: true, data: { password }, message: "New temporary password set." };
  } catch (e) {
    return toActionError(e);
  }
}
