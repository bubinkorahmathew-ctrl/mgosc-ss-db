import "server-only";
import { createClient } from "@/lib/db/server";
import { ageOn, todayISO } from "@/lib/dates";
import { classLabel } from "@/lib/format";
import { dobBoundsForAge, type RangeFilters, type StudentReportFilters } from "@/lib/validation/reports";

const MAX_ROWS = 5000;

/** Default date range for reports: start of the current academic year (or 90 days ago) to today. */
export async function defaultRange() {
  const dbc = await createClient();
  const { data } = await dbc.from("academic_years").select("start_date").eq("is_current", true).maybeSingle();
  const to = todayISO();
  const from = data?.start_date && data.start_date <= to ? data.start_date
    : new Date(Date.parse(to) - 90 * 864e5).toISOString().slice(0, 10);
  return { from, to };
}

/** Student list with age as of a chosen date. RLS limits teachers to their classes. */
export async function studentReport(f: StudentReportFilters, allowedClassIds: string[] | "all") {
  const dbc = await createClient();
  let q = dbc.from("students")
    .select("admission_no, full_name, full_name_ml, dob, gender, school_class, school_name, prayer_group, father_name, mother_name, guardian_phone, father_phone, email, address, baptism_name, status, classes(name, section)")
    .order("full_name").limit(MAX_ROWS);
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.class_id) q = q.eq("class_id", f.class_id);
  else if (allowedClassIds !== "all") q = q.in("class_id", allowedClassIds.length ? allowedClassIds : ["00000000-0000-0000-0000-000000000000"]);
  if (f.school_class) q = q.eq("school_class", f.school_class);
  if (f.gender) q = q.eq("gender", f.gender);
  const { latest, earliestExclusive } = dobBoundsForAge(f.as_of, f.age_min, f.age_max);
  if (latest) q = q.lte("dob", latest);
  if (earliestExclusive) q = q.gt("dob", earliestExclusive);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((s) => ({
    ...s,
    class: s.classes ? classLabel(s.classes) : "",
    age: ageOn(s.dob, f.as_of),
  }));
}
export type StudentReportRow = Awaited<ReturnType<typeof studentReport>>[number];

/** Per-student attendance counts for one class in a date range. */
export async function attendanceReport(classId: string, from: string, to: string) {
  const dbc = await createClient();
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
    });
  return { rows, sessions: dates.size };
}
export type AttendanceReportRow = Awaited<ReturnType<typeof attendanceReport>>["rows"][number];

export async function activityReport(f: RangeFilters, allowedClassIds: string[] | "all") {
  const dbc = await createClient();
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
