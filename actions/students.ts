"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { assertClassAccess, assertRole, assertSuperAdmin, AuthError } from "@/lib/auth";
import {
  deleteStudentSchema, moveStudentSchema, setStudentStatusSchema, studentSchema, updateStudentSchema,
} from "@/lib/validation/student";
import { toActionError, type ActionResult } from "@/lib/action-result";

type Client = Awaited<ReturnType<typeof createClient>>;

/** A unit must be one still offered, unless the student already has it. */
async function assertPrayerUnit(dbc: Client, unitId: string, currentId?: string) {
  if (unitId === currentId) return;
  const { data } = await dbc.from("prayer_units").select("id").eq("id", unitId).eq("active", true).maybeSingle();
  if (!data) throw new Error("choose a prayer unit from the list");
}

function revalidateStudents(id?: string) {
  revalidatePath("/admin/students");
  revalidatePath("/admin");
  if (id) revalidatePath(`/admin/students/${id}`);
}

/** Admins add to any class; teachers only to their own. The admission number is generated with the insert. */
export async function createStudent(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const data = studentSchema.parse(input);
    if (user.profile.role === "teacher") {
      if (!data.class_id) throw new AuthError("Choose one of your classes.");
      await assertClassAccess(user, data.class_id);
    }
    const dbc = await createClient();
    await assertPrayerUnit(dbc, data.prayer_unit_id);
    const { data: row, error } = await dbc.from("students").insert(data).select("id, admission_no").single();
    if (error) throw error;
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
    await assertRole("headmaster");
    const { id, ...data } = updateStudentSchema.parse(input);
    const dbc = await createClient();
    const { data: current } = await dbc.from("students").select("prayer_unit_id").eq("id", id).maybeSingle();
    if (!current) return { ok: false, error: "Student not found." };
    await assertPrayerUnit(dbc, data.prayer_unit_id, current.prayer_unit_id);
    // leaving "inactive" in the edit form clears the reason; staying inactive keeps it
    const patch = data.status === "inactive" ? data : { ...data, inactive_reason: null };
    const { data: rows, error } = await dbc.from("students").update(patch).eq("id", id).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "Student not found." };
    revalidateStudents(id);
    return { ok: true, message: "Student updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function moveStudent(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id, class_id } = moveStudentSchema.parse(input);
    const dbc = await createClient();
    const { data: rows, error } = await dbc.from("students").update({ class_id }).eq("id", id).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "Student not found." };
    revalidateStudents(id);
    return { ok: true, message: "Class changed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setStudentStatus(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id, status, inactive_reason } = setStudentStatusSchema.parse(input);
    const dbc = await createClient();
    const { data: rows, error } = await dbc.from("students")
      .update({ status, inactive_reason: status === "inactive" ? inactive_reason : null })
      .eq("id", id).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "Student not found." };
    revalidateStudents(id);
    return { ok: true, message: status === "active" ? "Student re-activated." : "Student status updated." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Permanent: marks, attendance, activities and certificates of the student go too. */
export async function deleteStudent(input: unknown): Promise<ActionResult> {
  try {
    await assertSuperAdmin();
    const { id } = deleteStudentSchema.parse(input);
    const dbc = await createClient();
    const { data: rows, error } = await dbc.from("students").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "Student not found." };
    revalidateStudents();
    revalidatePath("/teacher/students");
    revalidatePath("/teacher");
    return { ok: true, message: "Student deleted." };
  } catch (e) {
    return toActionError(e);
  }
}
