"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyTeachersOfNewStudent } from "@/lib/email/notifications";
import { assertRole, assertSuperAdmin } from "@/lib/auth";
import {
  deleteStudentSchema, moveStudentSchema, setStudentStatusSchema, studentSchema, updateStudentSchema,
} from "@/lib/validation/student";
import * as students from "@/lib/repo/students";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateStudents(id?: string) {
  revalidatePath("/admin/students");
  revalidatePath("/admin");
  if (id) revalidatePath(`/admin/students/${id}`);
}

/** Admins add to any class; teachers only to their own. The admission number is generated with the insert. */
export async function createStudent(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertRole("teacher", "admin");
    const row = await students.createStudent(user, studentSchema.parse(input));
    // the class's other teachers hear about it (not the person who added the student)
    after(() => notifyTeachersOfNewStudent(row.id, user.id));
    revalidateStudents();
    revalidatePath("/teacher/students");
    revalidatePath("/teacher");
    return { ok: true, data: { id: row.id }, message: `Student added (${row.admission_no}).` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateStudent(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    const data = updateStudentSchema.parse(input);
    await students.updateStudent(user, data);
    revalidateStudents(data.id);
    return { ok: true, message: "Student updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function moveStudent(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    const data = moveStudentSchema.parse(input);
    await students.moveStudent(user, data);
    revalidateStudents(data.id);
    return { ok: true, message: "Class changed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setStudentStatus(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    const data = setStudentStatusSchema.parse(input);
    await students.setStudentStatus(user, data);
    revalidateStudents(data.id);
    return { ok: true, message: data.status === "active" ? "Student re-activated." : "Student status updated." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Permanent: marks, attendance, activities and certificates of the student go too. */
export async function deleteStudent(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertSuperAdmin();
    await students.deleteStudent(user, deleteStudentSchema.parse(input).id);
    revalidateStudents();
    revalidatePath("/teacher/students");
    revalidatePath("/teacher");
    return { ok: true, message: "Student deleted." };
  } catch (e) {
    return toActionError(e);
  }
}
