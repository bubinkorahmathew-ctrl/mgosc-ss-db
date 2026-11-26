"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { activitySchema, saveAttendanceSchema, saveExamAttendanceSchema, saveMarksSchema } from "@/lib/validation/teacher";
import * as teaching from "@/lib/repo/teaching";
import { toActionError, type ActionResult } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export async function saveAttendance(input: unknown): Promise<ActionResult<{ saved: number }>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const saved = await teaching.saveAttendance(user, saveAttendanceSchema.parse(input));
    revalidatePath("/teacher/attendance");
    revalidatePath("/admin/attendance");
    revalidatePath("/teacher");
    revalidatePath("/admin");
    return { ok: true, data: { saved }, message: `Attendance saved for ${saved} students.` };
  } catch (e) {
    return toActionError(e);
  }
}

/** Who sat the exam. Absent students get no marks and no result. */
export async function saveExamAttendance(input: unknown): Promise<ActionResult<{ saved: number }>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const data = saveExamAttendanceSchema.parse(input);
    const absent = await teaching.saveExamAttendance(user, data);
    revalidatePath("/teacher/marks");
    revalidatePath("/admin/exams");
    revalidatePath("/admin/report-cards");
    const saved = data.entries.length;
    return { ok: true, data: { saved }, message: `Exam attendance saved: ${saved - absent} present, ${absent} absent.` };
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
    const result = await teaching.saveMarks(user, saveMarksSchema.parse(input));
    if ("fieldErrors" in result) {
      return { ok: false, error: Object.values(result.fieldErrors)[0][0], fieldErrors: result.fieldErrors };
    }
    revalidatePath("/teacher/marks");
    revalidatePath("/admin/exams");
    revalidatePath("/admin/report-cards");
    return { ok: true, data: result, message: "Marks saved." };
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
    const data = activitySchema.parse(input);
    const id = await teaching.saveActivity(user, data);
    if (!id) return { ok: false, error: "Activity not found." };
    revalidatePath("/teacher/activities");
    if (data.student_id) revalidatePath(`/teacher/students/${data.student_id}`);
    return { ok: true, data: { id }, message: data.id ? "Activity updated." : "Activity added." };
  } catch (e) {
    return toActionError(e);
  }
}
