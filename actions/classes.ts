"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { uuid } from "@/lib/validation/common";
import { academicYearSchema, classSchema } from "@/lib/validation/staff";
import * as academics from "@/lib/repo/academics";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateClasses() {
  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  revalidatePath("/admin/students");
  revalidatePath("/admin/teachers");
}

export async function saveAcademicYear(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertRole("admin");
    const id = await academics.saveAcademicYear(user, academicYearSchema.parse(input));
    revalidateClasses();
    return { ok: true, data: { id }, message: "Academic year saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setCurrentAcademicYear(yearId: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    await academics.setCurrentAcademicYear(user, uuid.parse(yearId));
    revalidateClasses();
    return { ok: true, message: "Current academic year changed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveClass(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertRole("admin");
    const data = classSchema.parse(input);
    const id = await academics.saveClass(user, data);
    revalidateClasses();
    return { ok: true, data: { id }, message: data.id ? "Class updated." : "Class created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteClass(classId: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    await academics.deleteClass(user, uuid.parse(classId));
    revalidateClasses();
    return { ok: true, message: "Class deleted." };
  } catch (e) {
    return toActionError(e);
  }
}
