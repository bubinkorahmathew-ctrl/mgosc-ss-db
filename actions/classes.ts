"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth";
import { uuid } from "@/lib/validation/common";
import { academicYearSchema, classSchema } from "@/lib/validation/staff";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateClasses() {
  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  revalidatePath("/admin/students");
  revalidatePath("/admin/teachers");
}

export async function saveAcademicYear(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole("headmaster");
    const { id, is_current, ...data } = academicYearSchema.parse(input);
    const supabase = await createClient();
    const q = id
      ? supabase.from("academic_years").update(data).eq("id", id).select("id").single()
      : supabase.from("academic_years").insert(data).select("id").single();
    const { data: row, error } = await q;
    if (error) throw error;
    if (is_current) {
      const { error: e2 } = await supabase.rpc("set_current_academic_year", { p_year_id: row.id });
      if (e2) throw e2;
    }
    revalidateClasses();
    return { ok: true, data: { id: row.id }, message: "Academic year saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setCurrentAcademicYear(yearId: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const id = uuid.parse(yearId);
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_current_academic_year", { p_year_id: id });
    if (error) throw error;
    revalidateClasses();
    return { ok: true, message: "Current academic year changed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveClass(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole("headmaster");
    const { id, teacher_ids, ...data } = classSchema.parse(input);
    const supabase = await createClient();

    // teachers must be existing, active teacher profiles
    if (teacher_ids.length) {
      const { data: t, error } = await supabase.from("profiles").select("id")
        .in("id", teacher_ids).eq("role", "teacher").eq("active", true);
      if (error) throw error;
      if ((t ?? []).length !== new Set(teacher_ids).size) return { ok: false, error: "One of the selected teachers is not available." };
    }

    const q = id
      ? supabase.from("classes").update(data).eq("id", id).select("id").single()
      : supabase.from("classes").insert(data).select("id").single();
    const { data: row, error } = await q;
    if (error) {
      if (/duplicate key/i.test(error.message)) return { ok: false, error: "A class with that name already exists in this year." };
      throw error;
    }

    // sync class_teachers
    const { data: existing, error: e1 } = await supabase.from("class_teachers").select("teacher_id").eq("class_id", row.id);
    if (e1) throw e1;
    const have = new Set((existing ?? []).map((r) => r.teacher_id));
    const want = new Set(teacher_ids);
    const toRemove = [...have].filter((t) => !want.has(t));
    const toAdd = [...want].filter((t) => !have.has(t));
    if (toRemove.length) {
      const { error: e2 } = await supabase.from("class_teachers").delete().eq("class_id", row.id).in("teacher_id", toRemove);
      if (e2) throw e2;
    }
    if (toAdd.length) {
      const { error: e3 } = await supabase.from("class_teachers").insert(toAdd.map((t) => ({ class_id: row.id, teacher_id: t })));
      if (e3) throw e3;
    }
    revalidateClasses();
    return { ok: true, data: { id: row.id }, message: id ? "Class updated." : "Class created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteClass(classId: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const id = uuid.parse(classId);
    const supabase = await createClient();
    const [{ count: students }, { count: exams }, { count: att }] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).eq("class_id", id),
      supabase.from("exams").select("id", { count: "exact", head: true }).eq("class_id", id),
      supabase.from("attendance").select("id", { count: "exact", head: true }).eq("class_id", id),
    ]);
    if ((students ?? 0) > 0 || (exams ?? 0) > 0 || (att ?? 0) > 0) {
      return { ok: false, error: "This class has students, exams or attendance. Move them first; classes with history cannot be deleted." };
    }
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) throw error;
    revalidateClasses();
    return { ok: true, message: "Class deleted." };
  } catch (e) {
    return toActionError(e);
  }
}
