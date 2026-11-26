import "server-only";
import { queryAs, type Viewer } from "./access";
import { ageParts, todayISO } from "@/lib/dates";
import { classLabel } from "@/lib/format";
import { studentConditions, studentOrder } from "@/lib/repo/students";
import { getExamResults, getGradeScale, getResultSubjects } from "@/lib/repo/results";
import type { RangeFilters, StudentReportFilters } from "@/lib/validation/reports";

const MAX_ROWS = 5000;

/** Default date range for reports: start of the current academic year (or 90 days ago) to today. */
export async function defaultRange(user: Viewer) {
  const dbc = queryAs(user);
  const { data } = await dbc.from("academic_years").select("start_date").eq("is_current", true).maybeSingle();
  const to = todayISO();
  const from = data?.start_date && data.start_date <= to ? data.start_date
    : new Date(Date.parse(to) - 90 * 864e5).toISOString().slice(0, 10);
  return { from, to };
}

/** Student list with age as on a chosen date, same filters as the Students page. The policies limit teachers to their classes. */
export async function studentReport(user: Viewer, f: StudentReportFilters, allowedClassIds: string[] | "all") {
  const dbc = queryAs(user);
  const order = studentOrder(f);
  let q = dbc.from("students")
    .select("admission_no, full_name, full_name_ml, dob, gender, school_class, school_name, father_name, mother_name, guardian_phone, father_phone, email, address, baptism_name, status, inactive_reason, classes(name, section), prayer_units(name)")
    .match(studentConditions(f))
    .order(order.column, { ascending: order.ascending }).limit(MAX_ROWS);
  if (order.column !== "full_name") q = q.order("full_name");
  if (!f.class_id && allowedClassIds !== "all") q = q.in("class_id", allowedClassIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((s) => {
    const { years, months } = ageParts(s.dob, f.as_of);
    return {
      ...s,
      class: s.classes ? classLabel(s.classes) : "",
      prayer_unit: s.prayer_units?.name ?? "",
      age: years,
      age_ym: `${years} y ${months} m`,
    };
  });
}
export type StudentReportRow = Awaited<ReturnType<typeof studentReport>>[number];

/**
 * Per-student attendance counts for one class in a date range. Attendance % = (present + late)
 * over the days that student was marked. `below`: only students under that %.
 */
export async function attendanceReport(user: Viewer, classId: string, from: string, to: string, below?: number) {
  const dbc = queryAs(user);
  const [{ data: students }, { data: att, error }] = await Promise.all([
    dbc.from("students").select("id, admission_no, full_name, status").eq("class_id", classId).order("full_name"),
    dbc.from("attendance").select("student_id, date, status").eq("class_id", classId)
      .gte("date", from).lte("date", to).limit(50000),
  ]);
  if (error) throw error;
  const dates = new Set<string>();
  const counts = new Map<string, { present: number; late: number; absent: number }>();
  for (const a of att ?? []) {
    dates.add(a.date);
    const c = counts.get(a.student_id) ?? { present: 0, late: 0, absent: 0 };
    c[a.status]++;
    counts.set(a.student_id, c);
  }
  // include students who left the class but have attendance in the range
  const rows = (students ?? [])
    .filter((s) => s.status === "active" || counts.has(s.id))
    .map((s) => {
      const c = counts.get(s.id) ?? { present: 0, late: 0, absent: 0 };
      const days = c.present + c.late + c.absent;
      return {
        admission_no: s.admission_no, full_name: s.full_name, ...c, days,
        percentage: days ? Math.round(((c.present + c.late) / days) * 1000) / 10 : null,
      };
    })
    .filter((r) => below === undefined || (r.percentage !== null && r.percentage < below));
  return { rows, sessions: dates.size };
}
export type AttendanceReportRow = Awaited<ReturnType<typeof attendanceReport>>["rows"][number];

/**
 * Grade distribution: for one exam name in the academic year, how many students of each class
 * got each grade (plus Absent and not yet graded). Classes the caller can't see are left out.
 */
export async function gradeDistribution(user: Viewer, yearId: string, examName: string, classIds: string[] | "all") {
  const dbc = queryAs(user);
  let q = dbc.from("exams").select("id, name, class_id, classes(name, section)").eq("academic_year_id", yearId).eq("name", examName);
  if (classIds !== "all") q = q.in("class_id", classIds);
  const { data: exams, error } = await q;
  if (error) throw error;
  const [scale, subjects] = await Promise.all([getGradeScale(user), getResultSubjects(user)]);
  const grades = [...scale].sort((a, b) => b.min_percent - a.min_percent).map((g) => g.grade);
  const rows = [];
  for (const e of exams ?? []) {
    const r = await getExamResults(user, e.id, { scale, subjects });
    if (!r) continue;
    const counts: Record<string, number> = Object.fromEntries(grades.map((g) => [g, 0]));
    let absent = 0, pending = 0, pass = 0, fail = 0;
    for (const s of r.results) {
      if (s.examAbsent) absent++;
      else if (s.grade) counts[s.grade] = (counts[s.grade] ?? 0) + 1;
      else pending++;
      if (s.result === "Pass") pass++;
      if (s.result === "Fail") fail++;
    }
    rows.push({ examId: e.id, class: e.classes ? classLabel(e.classes) : "", counts, absent, pending, pass, fail, students: r.results.length });
  }
  rows.sort((a, b) => a.class.localeCompare(b.class, undefined, { numeric: true }));
  return { grades, rows };
}

/** Distinct exam names of an academic year, as the caller may see them. */
export async function examNames(user: Viewer, yearId: string) {
  const dbc = queryAs(user);
  const { data } = await dbc.from("exams").select("name, exam_date").eq("academic_year_id", yearId).order("exam_date", { ascending: false, nullsFirst: false });
  return [...new Set((data ?? []).map((e) => e.name))];
}

/** Who sat one exam: counts, and the absentees with their remarks. Null if the caller can't see the exam. */
export async function examAttendanceReport(user: Viewer, examId: string) {
  const dbc = queryAs(user);
  const { data: exam } = await dbc.from("exams").select("id, name, exam_date, class_id, classes(name, section)")
    .eq("id", examId).maybeSingle();
  if (!exam) return null;
  const [{ data: rows, error }, { data: classStudents }] = await Promise.all([
    dbc.from("exam_attendance").select("student_id, status, remark, students(full_name, admission_no)").eq("exam_id", examId),
    dbc.from("students").select("id, full_name, admission_no").eq("class_id", exam.class_id).eq("status", "active").order("full_name"),
  ]);
  if (error) throw error;
  const marked = new Map((rows ?? []).map((r) => [r.student_id, r]));
  const absentees = (rows ?? []).filter((r) => r.status === "absent")
    .map((r) => ({ admission_no: r.students?.admission_no ?? "", full_name: r.students?.full_name ?? "", remark: r.remark ?? "" }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const notMarked = (classStudents ?? []).filter((s) => !marked.has(s.id));
  return {
    exam: { id: exam.id, name: exam.name, exam_date: exam.exam_date, class_id: exam.class_id },
    className: exam.classes ? classLabel(exam.classes) : "",
    present: (rows ?? []).filter((r) => r.status === "present").length,
    absent: absentees.length,
    absentees,
    notMarked: notMarked.map((s) => ({ admission_no: s.admission_no, full_name: s.full_name })),
  };
}
export type ExamAttendanceReport = NonNullable<Awaited<ReturnType<typeof examAttendanceReport>>>;

export async function activityReport(user: Viewer, f: RangeFilters, allowedClassIds: string[] | "all") {
  const dbc = queryAs(user);
  let q = dbc.from("activities")
    .select("id, type, title, activity_date, score, notes, classes(name, section), students(full_name, admission_no)")
    .gte("activity_date", f.from).lte("activity_date", f.to)
    .order("activity_date", { ascending: false }).limit(MAX_ROWS);
  if (f.class_id) q = q.eq("class_id", f.class_id);
  else if (allowedClassIds !== "all") q = q.in("class_id", allowedClassIds.length ? allowedClassIds : ["00000000-0000-0000-0000-000000000000"]);
  if (f.type) q = q.eq("type", f.type as "competition");
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((a) => ({
    ...a,
    class: a.classes ? classLabel(a.classes) : "",
    student: a.students ? a.students.full_name : "Whole class",
  }));
}
export type ActivityReportRow = Awaited<ReturnType<typeof activityReport>>[number];
