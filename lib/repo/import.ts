import "server-only";
/** Bulk upload (Excel): what the checks read, and the all-or-nothing saves. Rights are those of the manual screens. */
import { AuthError } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { classLabel } from "@/lib/format";
import type { AttendanceStatus, StudentRow } from "@/lib/db/types";
import type { ClassStudent, Subject } from "@/lib/import/parse";
import { assertTeacherOfClass, dbAs, requireRole, type Viewer } from "./access";

/** A class the user may work with, its students (every status) and a title. */
export async function loadClass(user: Viewer, classId: string) {
  const db = dbAs(user);
  const [cls] = await db.select("classes", { where: [["id", "eq", classId]] });
  if (!cls) throw new AuthError("That class is not available to you.");
  await assertTeacherOfClass(user, cls.id);
  const [[year], students] = await Promise.all([
    db.select("academic_years", { where: [["id", "eq", cls.academic_year_id]] }),
    db.select("students", { where: [["class_id", "eq", cls.id]], order: [{ column: "full_name" }] }),
  ]);
  return {
    id: cls.id,
    title: year ? `${classLabel(cls)} (${year.name})` : classLabel(cls),
    isCurrent: year?.is_current ?? false,
    students: students.map((s): ClassStudent & { status: string } => ({
      id: s.id, admission_no: s.admission_no, full_name: s.full_name, status: s.status,
    })),
  };
}

/** An exam the user may enter marks for, with subjects and saved marks. */
export async function loadExam(user: Viewer, examId: string) {
  const db = dbAs(user);
  const [exam] = await db.select("exams", { where: [["id", "eq", examId]] });
  if (!exam) throw new AuthError("That exam is not available to you.");
  const cls = await loadClass(user, exam.class_id);
  const [subjects, marks] = await Promise.all([
    db.select("subjects", { order: [{ column: "sort_order" }, { column: "name" }] }),
    db.select("marks", { where: [["exam_id", "eq", exam.id]] }),
  ]);
  return {
    id: exam.id,
    classId: cls.id,
    title: `${exam.name}${exam.exam_date ? ` (${formatDate(exam.exam_date)})` : ""} · ${cls.title}`,
    students: cls.students,
    subjects: subjects.map((s): Subject => ({ id: s.id, name: s.name, max: Number(s.max_marks) })),
    saved: new Map(marks.map((m) => [`${m.student_id}:${m.subject_id}`, Number(m.marks_obtained)])),
  };
}

/** Prayer units offered on the forms. */
export async function activePrayerUnits(user: Viewer) {
  return dbAs(user).select("prayer_units", { where: [["active", "eq", true]] });
}

/** Students the user can see who were born on these days (to spot people already on the list). */
export async function studentsBornOn(user: Viewer, dobs: string[]) {
  return dobs.length ? dbAs(user).select("students", { where: [["dob", "in", dobs]] }) : [];
}

type NewStudent = Omit<StudentRow, "id" | "admission_no" | "class_id" | "status" | "created_at" | "photo_url" | "inactive_reason">;

/** Adds the students in one transaction (admission numbers in order), all or none. */
export async function insertStudents(user: Viewer, students: Partial<NewStudent>[], classId: string | null) {
  requireRole(user, "teacher", "headmaster");
  if (user.profile.role === "teacher") {
    if (!classId) throw new AuthError("Choose one of your classes.");
    await assertTeacherOfClass(user, classId);
  }
  return dbAs(user).insert("students", students.map((s) => ({ ...s, class_id: classId, status: "active" as const })) as never);
}

/** Saves the marks in one transaction, all or none. */
export async function upsertMarks(
  user: Viewer, examId: string, entries: { student_id: string; subject_id: string; marks_obtained: number }[],
) {
  requireRole(user, "teacher", "headmaster");
  return dbAs(user).upsert("marks", entries.map((e) => ({ ...e, is_absent: false, exam_id: examId, entered_by: user.id })));
}

/** Saves the attendance in one transaction, all or none. */
export async function upsertAttendance(
  user: Viewer, classId: string, entries: { student_id: string; date: string; status: AttendanceStatus; remark?: string | null }[],
) {
  requireRole(user, "teacher", "headmaster");
  await assertTeacherOfClass(user, classId);
  return dbAs(user).upsert("attendance", entries.map((e) => ({ ...e, class_id: classId, marked_by: user.id })));
}
