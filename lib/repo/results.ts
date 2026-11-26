import "server-only";
import { queryAs, type Viewer } from "./access";
import { classLabel } from "@/lib/format";
import { DEFAULT_SCALE, type GradeBand } from "@/lib/grades";
import { computeAnnual, computeResults, type ResultStudent, type ResultSubject } from "@/lib/results";

export type AttendanceSummary = { present: number; late: number; absent: number; days: number };

/** The school's grade scale, highest band first (the default if none is saved). */
export async function getGradeScale(user: Viewer): Promise<GradeBand[]> {
  const dbc = queryAs(user);
  const { data } = await dbc.from("grade_scales").select("min_percent, max_percent, grade, grade_point, remark, is_pass")
    .order("min_percent", { ascending: false });
  if (!data?.length) return DEFAULT_SCALE;
  return data.map((g) => ({
    ...g, min_percent: Number(g.min_percent), max_percent: Number(g.max_percent),
    grade_point: g.grade_point === null ? null : Number(g.grade_point),
  }));
}

/** Subjects in order, with their maximum and pass percentage. */
export async function getResultSubjects(user: Viewer): Promise<ResultSubject[]> {
  const dbc = queryAs(user);
  const { data } = await dbc.from("subjects").select("id, name, max_marks, pass_percent, sort_order").order("sort_order").order("name");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, max: Number(s.max_marks), passPercent: Number(s.pass_percent) }));
}

/**
 * Everything needed for an exam's results / report cards. The policies decide visibility:
 * returns null if the caller cannot see the exam.
 * Students = active students of the class + anyone who has marks in this exam
 * (so results of past years still show after promotion).
 */
export async function getExamResults(user: Viewer, examId: string, shared?: { scale: GradeBand[]; subjects: ResultSubject[] }) {
  const dbc = queryAs(user);
  const { data: exam } = await dbc.from("exams")
    .select("id, name, exam_date, weight, class_id, academic_year_id, classes(id, name, section), academic_years(name, start_date, end_date)")
    .eq("id", examId).maybeSingle();
  if (!exam || !exam.classes || !exam.academic_years) return null;

  const [scale, subj, { data: marks }, { data: classStudents }, { data: examAttendance }] = await Promise.all([
    shared?.scale ?? getGradeScale(user),
    shared?.subjects ?? getResultSubjects(user),
    dbc.from("marks").select("student_id, subject_id, marks_obtained, is_absent").eq("exam_id", examId),
    dbc.from("students").select("id, admission_no, full_name, full_name_ml, dob")
      .eq("class_id", exam.class_id).eq("status", "active"),
    dbc.from("exam_attendance").select("student_id, status").eq("exam_id", examId),
  ]);
  const examAbsent = new Set((examAttendance ?? []).filter((a) => a.status === "absent").map((a) => a.student_id));

  const known = new Set((classStudents ?? []).map((s) => s.id));
  const missing = [...new Set([...(marks ?? []), ...(examAttendance ?? [])].map((m) => m.student_id))].filter((id) => !known.has(id));
  const { data: extra } = missing.length
    ? await dbc.from("students").select("id, admission_no, full_name, full_name_ml, dob").in("id", missing)
    : { data: [] as NonNullable<typeof classStudents> };

  const students: ResultStudent[] = [...(classStudents ?? []), ...(extra ?? [])].map((s) => ({
    id: s.id, name: s.full_name, nameMl: s.full_name_ml, admissionNo: s.admission_no, dob: s.dob,
  }));
  const results = computeResults(students, subj,
    (marks ?? []).map((m) => ({ ...m, marks_obtained: Number(m.marks_obtained) })), examAbsent, scale);

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
    exam: {
      id: exam.id, name: exam.name, exam_date: exam.exam_date, class_id: exam.class_id,
      academic_year_id: exam.academic_year_id, weight: Number(exam.weight),
    },
    className: classLabel(exam.classes),
    yearName: year.name,
    subjects: subj,
    scale,
    results,
    attendance,
  };
}
export type ExamResults = NonNullable<Awaited<ReturnType<typeof getExamResults>>>;

/** Exams visible to the caller for a class, newest first. */
export async function getClassExams(user: Viewer, classId: string) {
  const dbc = queryAs(user);
  const { data } = await dbc.from("exams").select("id, name, exam_date, weight")
    .eq("class_id", classId).order("exam_date", { ascending: false, nullsFirst: false }).order("name");
  return (data ?? []).map((e) => ({ ...e, weight: Number(e.weight) }));
}

/**
 * The annual result of a class: the chosen exams combined (weighted average of percentages),
 * with grade, result and rank worked out the same way as for one exam.
 */
export async function getAnnualResults(user: Viewer, classId: string, examIds: string[]) {
  const [scale, subjects] = await Promise.all([getGradeScale(user), getResultSubjects(user)]);
  const exams = (await Promise.all(examIds.map((id) => getExamResults(user, id, { scale, subjects }))))
    .filter((e): e is ExamResults => !!e && e.exam.class_id === classId);
  if (!exams.length) return null;
  const rows = computeAnnual(exams.map((e) => ({ examId: e.exam.id, weight: e.exam.weight, results: e.results })), scale);
  return {
    className: exams[0].className, yearName: exams[0].yearName, academicYearId: exams[0].exam.academic_year_id,
    exams: exams.map((e) => ({ id: e.exam.id, name: e.exam.name, weight: e.exam.weight, exam_date: e.exam.exam_date })),
    rows,
    scale,
  };
}
export type AnnualResults = NonNullable<Awaited<ReturnType<typeof getAnnualResults>>>;

/** A year's classes as select options, in natural order (report cards page). */
export async function yearClassOptions(user: Viewer, yearId: string) {
  const { data } = await queryAs(user).from("classes").select("id, name, section").eq("academic_year_id", yearId);
  return (data ?? []).map((c) => ({ value: c.id, label: classLabel(c) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** The teachers of a class, joined by commas (report card footer), or null. */
export async function classTeacherNames(user: Viewer, classId: string): Promise<string | null> {
  const { data } = await queryAs(user).from("class_teachers").select("profiles(full_name)").eq("class_id", classId);
  return (data ?? []).map((t) => t.profiles?.full_name).filter(Boolean).join(", ") || null;
}