"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertClassAccess, assertRole, AuthError } from "@/lib/auth";
import { activitySchema, saveAttendanceSchema, saveMarksSchema } from "@/lib/validation/teacher";
import { changePasswordSchema } from "@/lib/validation/staff";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/action-result";

/** Ensure every student id belongs to the class (server re-check on top of RLS + triggers). */
async function assertStudentsInClass(classId: string, studentIds: string[]) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("students").select("id").eq("class_id", classId).in("id", studentIds);
  if (error) throw error;
  if ((data ?? []).length !== new Set(studentIds).size) throw new AuthError("Some students are not in this class.");
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export async function saveAttendance(input: unknown): Promise<ActionResult<{ saved: number }>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const { class_id, date, entries } = saveAttendanceSchema.parse(input);
    await assertClassAccess(user, class_id);
    await assertStudentsInClass(class_id, entries.map((e) => e.student_id));

    const supabase = await createClient();
    const { error } = await supabase.from("attendance").upsert(
      entries.map((e) => ({ student_id: e.student_id, class_id, date, status: e.status, marked_by: user.id })),
      { onConflict: "student_id,date" },
    );
    if (error) throw error;
    revalidatePath("/teacher/attendance");
    revalidatePath("/teacher");
    revalidatePath("/admin");
    return { ok: true, data: { saved: entries.length }, message: `Attendance saved for ${entries.length} students.` };
  } catch (e) {
    return toActionError(e);
  }
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------
export async function saveMarks(input: unknown): Promise<ActionResult<{ saved: number }>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const { exam_id, rows } = saveMarksSchema.parse(input);
    const supabase = await createClient();

    // RLS: a teacher only sees exams of their own classes
    const { data: exam } = await supabase.from("exams").select("id, class_id").eq("id", exam_id).maybeSingle();
    if (!exam) throw new AuthError("That exam is not available to you.");
    await assertClassAccess(user, exam.class_id);
    await assertStudentsInClass(exam.class_id, rows.map((r) => r.student_id));

    const { data: subjects, error: sErr } = await supabase.from("subjects").select("id, name, max_marks");
    if (sErr) throw sErr;
    const subjectMap = new Map((subjects ?? []).map((s) => [s.id, s]));

    const { data: existing, error: eErr } = await supabase.from("marks")
      .select("id, student_id, subject_id").eq("exam_id", exam_id).in("student_id", rows.map((r) => r.student_id));
    if (eErr) throw eErr;
    const existingKey = new Map((existing ?? []).map((m) => [`${m.student_id}:${m.subject_id}`, m.id]));

    const upserts: { exam_id: string; student_id: string; subject_id: string; marks_obtained: number; entered_by: string }[] = [];
    const toDelete: string[] = [];
    const fieldErrors: Record<string, string[]> = {};

    for (const row of rows) {
      for (const [subjectId, value] of Object.entries(row.marks)) {
        const subject = subjectMap.get(subjectId);
        if (!subject) { fieldErrors[`${row.student_id}:${subjectId}`] = ["Unknown subject."]; continue; }
        const key = `${row.student_id}:${subjectId}`;
        if (value === null) {
          const id = existingKey.get(key);
          if (id) {
            if (user.profile.role !== "headmaster") {
              fieldErrors[key] = ["A saved mark cannot be cleared. Enter 0 or ask the headmaster."];
            } else toDelete.push(id);
          }
          continue;
        }
        if (value > Number(subject.max_marks)) {
          fieldErrors[key] = [`${subject.name}: maximum is ${subject.max_marks}.`];
          continue;
        }
        upserts.push({ exam_id, student_id: row.student_id, subject_id: subjectId, marks_obtained: value, entered_by: user.id });
      }
    }
    if (Object.keys(fieldErrors).length) {
      return { ok: false, error: Object.values(fieldErrors)[0][0], fieldErrors };
    }

    if (upserts.length) {
      const { error } = await supabase.from("marks").upsert(upserts, { onConflict: "exam_id,student_id,subject_id" });
      if (error) throw error;
    }
    if (toDelete.length) {
      const { error } = await supabase.from("marks").delete().in("id", toDelete);
      if (error) throw error;
    }
    revalidatePath("/teacher/marks");
    revalidatePath("/admin/exams");
    revalidatePath("/admin/report-cards");
    return { ok: true, data: { saved: upserts.length + toDelete.length }, message: "Marks saved." };
  } catch (e) {
    return toActionError(e);
  }
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------
export async function saveActivity(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const { id, ...data } = activitySchema.parse(input);
    await assertClassAccess(user, data.class_id);
    if (data.student_id) await assertStudentsInClass(data.class_id, [data.student_id]);

    const supabase = await createClient();
    if (id) {
      // only rows of the teacher's classes are updatable (RLS); keep created_by untouched
      const { data: rows, error } = await supabase.from("activities").update(data).eq("id", id).select("id");
      if (error) throw error;
      if (!rows?.length) return { ok: false, error: "Activity not found." };
      revalidatePath("/teacher/activities");
      return { ok: true, data: { id }, message: "Activity updated." };
    }
    const { data: row, error } = await supabase.from("activities")
      .insert({ ...data, created_by: user.id }).select("id").single();
    if (error) throw error;
    revalidatePath("/teacher/activities");
    if (data.student_id) revalidatePath(`/teacher/students/${data.student_id}`);
    return { ok: true, data: { id: row.id }, message: "Activity added." };
  } catch (e) {
    return toActionError(e);
  }
}

// ---------------------------------------------------------------------------
// Own password
// ---------------------------------------------------------------------------
const changeOwnPasswordSchema = z.object({ current: z.string().min(1, "Enter your current password.") })
  .and(changePasswordSchema);

export async function changeOwnPassword(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const { current, password } = changeOwnPasswordSchema.parse(input);
    if (!user.email) return { ok: false, error: "Your account has no email address." };
    if (current === password) return { ok: false, error: "The new password must be different.", fieldErrors: { password: ["The new password must be different."] } };

    const supabase = await createClient();
    // re-authenticate with the current password before changing it
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (authErr) return { ok: false, error: "Current password is incorrect.", fieldErrors: { current: ["Current password is incorrect."] } };

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (/weak|short|characters/i.test(error.message)) return { ok: false, error: "Please choose a stronger password." };
      throw error;
    }
    return { ok: true, message: "Password changed." };
  } catch (e) {
    return toActionError(e);
  }
}
