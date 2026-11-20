"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth";
import {
  moveStudentSchema, setStudentStatusSchema, studentSchema, updateStudentSchema,
} from "@/lib/validation/student";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateStudents(id?: string) {
  revalidatePath("/admin/students");
  revalidatePath("/admin");
  if (id) revalidatePath(`/admin/students/${id}`);
}

/** Headmaster only: add a student directly (admission number auto-generated). */
export async function createStudent(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole("headmaster");
    const data = studentSchema.parse(input);
    const supabase = await createClient();

    const { data: year, error: yErr } = await supabase.rpc("current_number_year");
    if (yErr) throw yErr;
    const { data: admissionNo, error: nErr } = await supabase.rpc("next_number", {
      p_kind: "admission", p_year: year,
    });
    if (nErr) throw nErr;

    const { data: row, error } = await supabase.from("students")
      .insert({ ...data, admission_no: admissionNo }).select("id").single();
    if (error) throw error;
    revalidateStudents();
    return { ok: true, data: { id: row.id }, message: `Student added (${admissionNo}).` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateStudent(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id, ...data } = updateStudentSchema.parse(input);
    const supabase = await createClient();
    const { data: rows, error } = await supabase.from("students").update(data).eq("id", id).select("id");
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
    const supabase = await createClient();
    const { data: rows, error } = await supabase.from("students").update({ class_id }).eq("id", id).select("id");
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
    const { id, status } = setStudentStatusSchema.parse(input);
    const supabase = await createClient();
    const { data: rows, error } = await supabase.from("students").update({ status }).eq("id", id).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "Student not found." };
    revalidateStudents(id);
    return { ok: true, message: status === "active" ? "Student re-activated." : "Student status updated." };
  } catch (e) {
    return toActionError(e);
  }
}
