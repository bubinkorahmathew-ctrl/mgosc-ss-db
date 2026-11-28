import "server-only";
/** Attendance, exam attendance, marks and activities: what teachers record for their classes. */
import { AuthError } from "@/lib/auth";
import { TEACHER_ATTENDANCE_DAYS } from "@/lib/config";
import { teacherAttendanceFrom } from "@/lib/db/policies";
import { ABSENT_MARK } from "@/lib/validation/teacher";
import type { z } from "zod";
import type { activitySchema, saveAttendanceSchema, saveExamAttendanceSchema, saveMarksSchema } from "@/lib/validation/teacher";
import { assertTeacherOfClass, queryAs, requireRole, type Viewer } from "./access";
import { isAdmin } from "@/lib/permissions";

export { teacherAttendanceFrom };

/** Every student id belongs to the class (re-check on top of the policies and rules). */
export async function assertStudentsInClass(user: Viewer, classId: string, studentIds: string[]) {
  const { data, error } = await queryAs(user).from("students").select("id").eq("class_id", classId).in("id", studentIds);
  if (error) throw error;
  if ((data ?? []).length !== new Set(studentIds).size) throw new AuthError("Some students are not in this class.");
}

/** An exam the user may work on, or an error. */
async function examFor(user: Viewer, examId: string) {
  const { data: exam } = await queryAs(user).from("exams").select("id, class_id").eq("id", examId).maybeSingle();
  if (!exam) throw new AuthError("That exam is not available to you.");
  await assertTeacherOfClass(user, exam.class_id);
  return exam;
}

/** One day's attendance for a class: every student is saved, or none. */
export async function saveAttendance(user: Viewer, input: z.output<typeof saveAttendanceSchema>): Promise<number> {
  requireRole(user, "teacher", "admin");
  const { class_id, date, entries } = input;
  await assertTeacherOfClass(user, class_id);
  await assertStudentsInClass(user, class_id, entries.map((e) => e.student_id));
  if (user.profile.role === "teacher" && date < teacherAttendanceFrom()) {
    throw new AuthError(`Teachers can change attendance up to ${TEACHER_ATTENDANCE_DAYS} days back. Ask an admin for older dates.`);
  }
  const { error } = await queryAs(user).from("attendance").upsert(
    entries.map((e) => ({ student_id: e.student_id, class_id, date, status: e.status, remark: e.remark, marked_by: user.id })),
    { onConflict: "student_id,date" },
  );
  if (error) throw error;
  return entries.length;
}

/** Who sat the exam. Absent students get no marks and no result. Returns how many were absent. */
export async function saveExamAttendance(user: Viewer, input: z.output<typeof saveExamAttendanceSchema>): Promise<number> {
  requireRole(user, "teacher", "admin");
  const { exam_id, entries } = input;
  const exam = await examFor(user, exam_id);
  await assertStudentsInClass(user, exam.class_id, entries.map((e) => e.student_id));
  const { error } = await queryAs(user).from("exam_attendance").upsert(
    entries.map((e) => ({ exam_id, student_id: e.student_id, status: e.status, remark: e.remark, marked_by: user.id })),
    { onConflict: "exam_id,student_id" },
  );
  if (error) throw error;
  return entries.filter((e) => e.status === "absent").length;
}

/**
 * One exam's marks for some students. A blank clears a saved mark (admins only).
 * Returns the number saved, or field errors keyed "student" or "student:subject".
 */
export async function saveMarks(
  user: Viewer, input: z.output<typeof saveMarksSchema>,
): Promise<{ saved: number } | { fieldErrors: Record<string, string[]> }> {
  requireRole(user, "teacher", "admin");
  const { exam_id, rows } = input;
  const dbc = queryAs(user);
  const exam = await examFor(user, exam_id);
  await assertStudentsInClass(user, exam.class_id, rows.map((r) => r.student_id));

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
          if (!isAdmin(user.profile.role)) {
            fieldErrors[key] = ["A saved mark cannot be cleared. Enter 0 or ask an admin."];
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
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  if (upserts.length) {
    const { error } = await dbc.from("marks").upsert(upserts, { onConflict: "exam_id,student_id,subject_id" });
    if (error) throw error;
  }
  if (toDelete.length) {
    const { error } = await dbc.from("marks").delete().in("id", toDelete);
    if (error) throw error;
  }
  return { saved: upserts.length + toDelete.length };
}

/** Adds an activity, or updates one (`id`). Returns its id, or null if it isn't the user's to change. */
export async function saveActivity(user: Viewer, input: z.output<typeof activitySchema>): Promise<string | null> {
  requireRole(user, "teacher", "admin");
  const { id, ...data } = input;
  await assertTeacherOfClass(user, data.class_id);
  if (data.student_id) await assertStudentsInClass(user, data.class_id, [data.student_id]);
  const dbc = queryAs(user);
  if (id) {
    // only rows of the teacher's classes are updatable (policies); created_by is kept
    const { data: rows, error } = await dbc.from("activities").update(data).eq("id", id).select("id");
    if (error) throw error;
    return rows?.length ? id : null;
  }
  const { data: row, error } = await dbc.from("activities").insert({ ...data, created_by: user.id }).select("id").single();
  if (error) throw error;
  return row.id;
}

/** A class's attendance in one month (YYYY-MM), as the user may see it. */
export async function monthAttendance(user: Viewer, classId: string, month: string, nextMonth: string) {
  const { data, error } = await queryAs(user).from("attendance").select("student_id, date, status, remark").eq("class_id", classId)
    .gte("date", `${month}-01`).lt("date", `${nextMonth}-01`).limit(20000);
  if (error) throw error;
  return data ?? [];
}

/** Saved marks and exam attendance of one exam, as the user may see them. */
export async function examEntry(user: Viewer, examId: string) {
  const dbc = queryAs(user);
  const [{ data: marks }, { data: examAttendance }] = await Promise.all([
    dbc.from("marks").select("student_id, subject_id, marks_obtained, is_absent").eq("exam_id", examId),
    dbc.from("exam_attendance").select("student_id, status, remark").eq("exam_id", examId),
  ]);
  return { marks: marks ?? [], examAttendance: examAttendance ?? [] };
}
/** An exam with its class name (for the admin marks page), or null if not visible. */
export async function examWithClass(user: Viewer, examId: string) {
  const { data } = await queryAs(user).from("exams")
    .select("id, name, exam_date, class_id, academic_year_id, classes(name, section)").eq("id", examId).maybeSingle();
  return data?.classes ? { ...data, classes: data.classes } : null;
}

/** A class's activities, newest first; with `studentId`, that student's and the whole class's. */
export async function listActivities(user: Viewer, classId: string, studentId?: string) {
  let q = queryAs(user).from("activities")
    .select("id, type, title, activity_date, score, notes, student_id, students(full_name)")
    .eq("class_id", classId)
    .order("activity_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (studentId) q = q.or([["student_id", "eq", studentId], ["student_id", "is", null]]);
  const { data } = await q;
  return data ?? [];
}