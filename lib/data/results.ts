import "server-only";
import { createClient } from "@/lib/db/server";
import { classLabel } from "@/lib/format";
import { computeResults, type ResultStudent } from "@/lib/results";

export type AttendanceSummary = { present: number; late: number; absent: number; days: number };

/**
 * Everything needed for an exam's results / report cards. RLS decides visibility:
 * returns null if the caller cannot see the exam.
 * Students = active students of the class + anyone who has marks in this exam
 * (so results of past years still show after promotion).
 */
export async function getExamResults(examId: string) {
  const dbc = await createClient();
  const { data: exam } = await dbc.from("exams")
    .select("id, name, exam_date, class_id, academic_year_id, classes(id, name, section), academic_years(name, start_date, end_date)")
    .eq("id", examId).maybeSingle();
  if (!exam || !exam.classes || !exam.academic_years) return null;

  const [{ data: subjects }, { data: marks }, { data: classStudents }, { data: examAttendance }] = await Promise.all([
    dbc.from("subjects").select("id, name, max_marks, sort_order").order("sort_order").order("name"),
    dbc.from("marks").select("student_id, subject_id, marks_obtained, is_absent").eq("exam_id", examId),
    dbc.from("students").select("id, admission_no, full_name, full_name_ml, dob")
      .eq("class_id", exam.class_id).eq("status", "active"),
    dbc.from("exam_attendance").select("student_id, status").eq("exam_id", examId),
  ]);
  const examAbsent = new Set((examAttendance ?? []).filter((a) => a.status === "absent").map((a) => a.student_id));

  const known = new Set((classStudents ?? []).map((s) => s.id));
  const missing = [...new Set((marks ?? []).map((m) => m.student_id))].filter((id) => !known.has(id));
  const { data: extra } = missing.length
    ? await dbc.from("students").select("id, admission_no, full_name, full_name_ml, dob").in("id", missing)
    : { data: [] as NonNullable<typeof classStudents> };

  const students: ResultStudent[] = [...(classStudents ?? []), ...(extra ?? [])].map((s) => ({
    id: s.id, name: s.full_name, nameMl: s.full_name_ml, admissionNo: s.admission_no, dob: s.dob,
  }));
  const subj = (subjects ?? []).map((s) => ({ id: s.id, name: s.name, max: Number(s.max_marks) }));
  const results = computeResults(students, subj,
    (marks ?? []).map((m) => ({ ...m, marks_obtained: Number(m.marks_obtained) })), examAbsent);

  // attendance in this class during the exam's academic year
  const year = exam.academic_years;
  const { data: att } = await dbc.from("attendance").select("student_id, status")
    .eq("class_id", exam.class_id).gte("date", year.start_date).lte("date", year.end_date);
  const attendance: Record<string, AttendanceSummary> = {};
  for (const a of att ?? []) {
    const s = (attendance[a.student_id] ??= { present: 0, late: 0, absent: 0, days: 0 });
    s[a.status]++;
    s.days++;
  }

  return {
    exam: { id: exam.id, name: exam.name, exam_date: exam.exam_date, class_id: exam.class_id, academic_year_id: exam.academic_year_id },
    className: classLabel(exam.classes),
    yearName: year.name,
    subjects: subj,
    results,
    attendance,
  };
}
export type ExamResults = NonNullable<Awaited<ReturnType<typeof getExamResults>>>;

/** Exams visible to the caller for a class, newest first. */
export async function getClassExams(classId: string) {
  const dbc = await createClient();
  const { data } = await dbc.from("exams").select("id, name, exam_date")
    .eq("class_id", classId).order("exam_date", { ascending: false, nullsFirst: false }).order("name");
  return data ?? [];
}
