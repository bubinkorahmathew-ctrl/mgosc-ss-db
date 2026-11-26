"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import * as accounts from "@/lib/repo/accounts";
import { createTeacherSchema, teacherIdSchema, updateTeacherSchema } from "@/lib/validation/staff";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateTeachers() {
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/classes");
}

export async function createTeacher(input: unknown): Promise<ActionResult<{ email: string; password: string }>> {
  try {
    const user = await assertRole("headmaster");
    const details = createTeacherSchema.parse(input);
    const password = await accounts.createTeacher(user, details);
    revalidateTeachers();
    return { ok: true, data: { email: details.email, password }, message: "Teacher account created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateTeacher(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    await accounts.updateTeacher(user, updateTeacherSchema.parse(input));
    revalidateTeachers();
    return { ok: true, message: "Teacher updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setTeacherActive(input: unknown, active: boolean): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    const { id } = teacherIdSchema.parse(input);
    const on = active === true; // an action argument can be anything
    await accounts.setTeacherActive(user, id, on);
    revalidateTeachers();
    return { ok: true, message: on ? "Teacher re-activated." : "Teacher deactivated." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Sets a new temporary password and returns it once, for the admin to share. */
export async function resetTeacherPassword(input: unknown): Promise<ActionResult<{ password: string }>> {
  try {
    const user = await assertRole("headmaster");
    const password = await accounts.resetTeacherPassword(user, teacherIdSchema.parse(input).id);
    return { ok: true, data: { password }, message: "New temporary password set." };
  } catch (e) {
    return toActionError(e);
  }
}
