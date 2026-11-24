"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { assertClassAccess, assertRole, AuthError } from "@/lib/auth";
import { changePassword } from "@/lib/authn/login";
import { requestClient, setSessionCookie } from "@/lib/authn/request";
import { getDatabase } from "@/lib/db";
import {
  ABSENT_MARK, activitySchema, saveAttendanceSchema, saveExamAttendanceSchema, saveMarksSchema,
} from "@/lib/validation/teacher";
import { TEACHER_ATTENDANCE_DAYS } from "@/lib/config";
import { teacherAttendanceFrom } from "@/lib/db/policies";
import { changePasswordSchema } from "@/lib/validation/staff";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/action-result";

/** Ensure every student id belongs to the class (server re-check on top of RLS + triggers). */
async function assertStudentsInClass(classId: string, studentIds: string[]) {
  const dbc = await createClient();
  const { data, error } = await dbc.from("students").select("id").eq("class_id", classId).in("id", studentIds);
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

    if (user.profile.role === "teacher" && date < teacherAttendanceFrom()) {
      throw new AuthError(`Teachers can change attendance up to ${TEACHER_ATTENDANCE_DAYS} days back. Ask an admin for older dates.`);
    }

    // one statement, one transaction: every student of the day is saved, or none
    const dbc = await createClient();
    const { error } = await dbc.from("attendance").upsert(
      entries.map((e) => ({ student_id: e.student_id, class_id, date, status: e.status, remark: e.remark, marked_by: user.id })),
      { onConflict: "student_id,date" },
    );
    if (error) throw error;
    revalidatePath("/teacher/attendance");
    revalidatePath("/admin/attendance");
    revalidatePath("/teacher");
    revalidatePath("/admin");
    return { ok: true, data: { saved: entries.length }, message: `Attendance saved for ${entries.length} students.` };
  } catch (e) {
    return toActionError(e);
  }
}

/** Who sat the exam. Absent students get no marks and no result. */
export async function saveExamAttendance(input: unknown): Promise<ActionResult<{ saved: number }>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const { exam_id, entries } = saveExamAttendanceSchema.parse(input);
    const dbc = await createClient();
    const { data: exam } = await dbc.from("exams").select("id, class_id").eq("id", exam_id).maybeSingle();
    if (!exam) throw new AuthError("That exam is not available to you.");
    await assertClassAccess(user, exam.class_id);
    await assertStudentsInClass(exam.class_id, entries.map((e) => e.student_id));

    const { error } = await dbc.from("exam_attendance").upsert(
      entries.map((e) => ({ exam_id, student_id: e.student_id, status: e.status, remark: e.remark, marked_by: user.id })),
      { onConflict: "exam_id,student_id" },
    );
    if (error) throw error;
    revalidatePath("/teacher/marks");
    revalidatePath("/admin/exams");
    revalidatePath("/admin/report-cards");
    const absent = entries.filter((e) => e.status === "absent").length;
    return { ok: true, data: { saved: entries.length }, message: `Exam attendance saved: ${entries.length - absent} present, ${absent} absent.` };
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
    const dbc = await createClient();

    // RLS: a teacher only sees exams of their own classes
    const { data: exam } = await dbc.from("exams").select("id, class_id").eq("id", exam_id).maybeSingle();
    if (!exam) throw new AuthError("That exam is not available to you.");
    await assertClassAccess(user, exam.class_id);
    await assertStudentsInClass(exam.class_id, rows.map((r) => r.student_id));

    const { data: subjects, error: sErr } = await dbc.from("subjects").select("id, name, max_marks");
    if (sErr) throw sErr;
    const subjectMap = new Map((subjects ?? []).map((s) => [s.id, s]));

    const { data: existing, error: eErr } = await dbc.from("marks")
      .select("id, student_id, subject_id").eq("exam_id", exam_id).in("student_id", rows.map((r) => r.student_id));
    if (eErr) throw eErr;
    const existingKey = new Map((existing ?? []).map((m) => [`${m.student_id}:${m.subject_id}`, m.id]));
    const { data: away, error: aErr } = await dbc.from("exam_attendance")
      .select("student_id").eq("exam_id", exam_id).eq("status", "absent");
    if (aErr) throw aErr;
    const absentForExam = new Set((away ?? []).map((a) => a.student_id));

    const upserts: {
      exam_id: string; student_id: string; subject_id: string; marks_obtained: number; is_absent: boolean; entered_by: string;
    }[] = [];
    const toDelete: string[] = [];
    const fieldErrors: Record<string, string[]> = {};

    for (const row of rows) {
      if (absentForExam.has(row.student_id) && Object.values(row.marks).some((v) => v !== null)) {
        fieldErrors[row.student_id] = ["This student was absent for the exam. Change the exam attendance first."];
        continue;
      }
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
        if (value === ABSENT_MARK) {
          upserts.push({ exam_id, student_id: row.student_id, subject_id: subjectId, marks_obtained: 0, is_absent: true, entered_by: user.id });
          continue;
        }
        if (value > Number(subject.max_marks)) {
          fieldErrors[key] = [`${subject.name}: maximum is ${subject.max_marks}.`];
          continue;
        }
        upserts.push({ exam_id, student_id: row.student_id, subject_id: subjectId, marks_obtained: value, is_absent: false, entered_by: user.id });
      }
    }
    if (Object.keys(fieldErrors).length) {
      return { ok: false, error: Object.values(fieldErrors)[0][0], fieldErrors };
    }

    if (upserts.length) {
      const { error } = await dbc.from("marks").upsert(upserts, { onConflict: "exam_id,student_id,subject_id" });
      if (error) throw error;
    }
    if (toDelete.length) {
      const { error } = await dbc.from("marks").delete().in("id", toDelete);
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

    const dbc = await createClient();
    if (id) {
      // only rows of the teacher's classes are updatable (RLS); keep created_by untouched
      const { data: rows, error } = await dbc.from("activities").update(data).eq("id", id).select("id");
      if (error) throw error;
      if (!rows?.length) return { ok: false, error: "Activity not found." };
      revalidatePath("/teacher/activities");
      return { ok: true, data: { id }, message: "Activity updated." };
    }
    const { data: row, error } = await dbc.from("activities")
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
    if (current === password) return { ok: false, error: "The new password must be different.", fieldErrors: { password: ["The new password must be different."] } };

    // checks the current password, signs out every other device
    const result = await changePassword(getDatabase(), user.id, current, password, await requestClient());
    if (!result.ok) {
      if (result.reason === "limited") return { ok: false, error: "Too many attempts. Please wait 15 minutes and try again." };
      return { ok: false, error: "Current password is incorrect.", fieldErrors: { current: ["Current password is incorrect."] } };
    }
    await setSessionCookie(result.session);
    return { ok: true, message: "Password changed." };
  } catch (e) {
    return toActionError(e);
  }
}
