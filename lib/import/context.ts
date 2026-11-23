import "server-only";
import { assertClassAccess, AuthError, getUserDb, type CurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { classLabel } from "@/lib/format";
import type { ClassStudent, Subject } from "./parse";

/** A class the user may work with, its students (every status) and a title. Read through the policies. */
export async function loadClass(user: CurrentUser, classId: string) {
  const db = await getUserDb();
  const [cls] = await db.select("classes", { where: [["id", "eq", classId]] });
  if (!cls) throw new AuthError("That class is not available to you.");
  await assertClassAccess(user, cls.id);
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
export async function loadExam(user: CurrentUser, examId: string) {
  const db = await getUserDb();
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
