"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import {
  createTeacherAccount, resetTeacherAccountPassword, setTeacherAccountActive, updateTeacherAccount,
} from "@/lib/authn/accounts";
import { getDatabase } from "@/lib/db";
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
    const { password } = await createTeacherAccount(getDatabase(), user.id, details);
    revalidateTeachers();
    return { ok: true, data: { email: details.email, password }, message: "Teacher account created." };
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "23505") {
      return { ok: false, error: "A user with this email already exists." };
    }
    return toActionError(e);
  }
}

export async function updateTeacher(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    const { id, ...details } = updateTeacherSchema.parse(input);
    await updateTeacherAccount(getDatabase(), user.id, id, details);
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
    await setTeacherAccountActive(getDatabase(), user.id, id, on);
    revalidateTeachers();
    return { ok: true, message: on ? "Teacher re-activated." : "Teacher deactivated." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Sets a new temporary password and returns it once, for the headmaster to share. */
export async function resetTeacherPassword(input: unknown): Promise<ActionResult<{ password: string }>> {
  try {
    const user = await assertRole("headmaster");
    const { id } = teacherIdSchema.parse(input);
    const password = await resetTeacherAccountPassword(getDatabase(), user.id, id);
    return { ok: true, data: { password }, message: "New temporary password set." };
  } catch (e) {
    return toActionError(e);
  }
}
