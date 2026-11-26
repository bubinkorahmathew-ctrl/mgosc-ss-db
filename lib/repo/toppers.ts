import "server-only";
import { UserError } from "@/lib/user-error";
import type { GradeBand } from "@/lib/grades";
import { assertTeacherOfClass, queryAs, requireRole, type Viewer } from "./access";
import type { TopperScope } from "@/lib/db/functions";
import { todayISO } from "@/lib/dates";
import { classLabel } from "@/lib/format";
import { getSettings } from "@/lib/repo/settings";
import { getAnnualResults, getExamResults } from "@/lib/repo/results";
import { attendancePercent, enoughSessions, pickToppers, sundaysBetween, type Candidate, type Ranked } from "@/lib/toppers";

/** What to compare: one exam, an annual result (several exams), or attendance over a period. */
export type TopperQuery =
  | { kind: "exam"; classId: string; examId: string }
  | { kind: "annual"; classId: string; examIds: string[] }
  | { kind: "attendance"; classId: string; from: string; to: string };

export type TopperOutcome = {
  title: string;
  /** what "Assign" saves */
  scope: TopperScope;
  toppers: Ranked[];
  top: Ranked[];
  /** why there is no topper, when there is none */
  note: string | null;
  unit: "%";
};

async function classYear(user: Viewer, classId: string) {
  const dbc = queryAs(user);
  const { data } = await dbc.from("classes").select("id, name, section, academic_year_id, academic_years(name, start_date, end_date)")
    .eq("id", classId).maybeSingle();
  return data?.academic_years ? { ...data, year: data.academic_years } : null;
}

/** Calculated toppers and the top five. Read through the caller's policies; null if not visible. */
export async function computeToppers(user: Viewer, q: TopperQuery): Promise<TopperOutcome | null> {
  const cls = await classYear(user, q.classId);
  if (!cls) return null;
  const label = classLabel(cls);

  if (q.kind === "exam") {
    const r = await getExamResults(user, q.examId);
    if (!r || r.exam.class_id !== q.classId) return null;
    const candidates: Candidate[] = r.results.map((s) => ({
      id: s.id, name: s.name, admissionNo: s.admissionNo, value: s.percentage, eligible: !s.examAbsent && s.result === "Pass",
    }));
    const picked = pickToppers(candidates);
    const day = r.exam.exam_date;
    return {
      title: `${r.exam.name} · ${label}`,
      scope: {
        class_id: q.classId, type: "marks", exam_id: q.examId,
        period_start: day ?? cls.year.start_date, period_end: day ?? cls.year.end_date,
      },
      ...picked,
      note: picked.toppers.length ? null : "Nobody has passed every subject in this exam yet.",
      unit: "%",
    };
  }

  if (q.kind === "annual") {
    const a = await getAnnualResults(user, q.classId, q.examIds);
    if (!a) return null;
    const candidates: Candidate[] = a.rows.map((s) => ({
      id: s.id, name: s.name, admissionNo: s.admissionNo, value: s.percentage, eligible: s.passedAll,
    }));
    const picked = pickToppers(candidates);
    return {
      title: `Annual result (${a.exams.map((e) => e.name).join(", ")}) · ${label}`,
      scope: { class_id: q.classId, type: "marks", exam_id: null, period_start: cls.year.start_date, period_end: cls.year.end_date },
      ...picked,
      note: picked.toppers.length ? null : "Nobody sat and passed every chosen exam yet.",
      unit: "%",
    };
  }

  // attendance over a period
  const dbc = queryAs(user);
  const to = q.to > todayISO() ? todayISO() : q.to;
  const [settings, { data: rows, error }, { data: classStudents }] = await Promise.all([
    getSettings(user),
    dbc.from("attendance").select("student_id, date, status").eq("class_id", q.classId).gte("date", q.from).lte("date", to).limit(50000),
    dbc.from("students").select("id, full_name, admission_no").eq("class_id", q.classId).eq("status", "active"),
  ]);
  if (error) throw error;
  const sessions = new Set((rows ?? []).map((r) => r.date)).size;
  const counts = new Map<string, { present: number; late: number }>();
  for (const r of rows ?? []) {
    const c = counts.get(r.student_id) ?? { present: 0, late: 0 };
    if (r.status === "present") c.present++;
    if (r.status === "late") c.late++;
    counts.set(r.student_id, c);
  }
  // students who left the class but were marked in the period count too
  const known = new Set((classStudents ?? []).map((s) => s.id));
  const others = [...counts.keys()].filter((id) => !known.has(id));
  const { data: extra } = others.length
    ? await dbc.from("students").select("id, full_name, admission_no").in("id", others)
    : { data: [] as NonNullable<typeof classStudents> };
  const sundays = sundaysBetween(q.from, to);
  const enough = enoughSessions(sessions, sundays, settings.attendance_topper_min_pct);
  const candidates: Candidate[] = [...(classStudents ?? []), ...(extra ?? [])].map((s) => {
    const c = counts.get(s.id) ?? { present: 0, late: 0 };
    return { id: s.id, name: s.full_name, admissionNo: s.admission_no, value: attendancePercent(c.present, c.late, sessions), eligible: enough };
  });
  const picked = pickToppers(candidates);
  return {
    title: `Attendance · ${label}`,
    scope: { class_id: q.classId, type: "attendance", exam_id: null, period_start: q.from, period_end: to },
    ...picked,
    note: !sessions ? "No attendance was taken in this period."
      : !enough ? `Attendance was taken on ${sessions} of ${sundays} Sundays, below the ${settings.attendance_topper_min_pct}% needed for an attendance topper (Settings).`
      : null,
    unit: "%",
  };
}

/** Confirmed toppers, newest first, as the caller may see them. */
export async function listConfirmedToppers(user: Viewer, f: { classId?: string; studentId?: string; yearId?: string; limit?: number } = {}) {
  const dbc = queryAs(user);
  let q = dbc.from("toppers")
    .select("id, type, value, period_start, period_end, confirmed_at, class_id, student_id, exam_id, academic_year_id, students(full_name, admission_no), classes(name, section), exams(name)")
    .order("confirmed_at", { ascending: false }).limit(f.limit ?? 200);
  if (f.classId) q = q.eq("class_id", f.classId);
  if (f.studentId) q = q.eq("student_id", f.studentId);
  if (f.yearId) q = q.eq("academic_year_id", f.yearId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id, type: t.type, value: Number(t.value), periodStart: t.period_start, periodEnd: t.period_end,
    confirmedAt: t.confirmed_at, classId: t.class_id, studentId: t.student_id, examId: t.exam_id,
    student: t.students?.full_name ?? "", admissionNo: t.students?.admission_no ?? "",
    className: t.classes ? classLabel(t.classes) : "",
    what: t.type === "attendance" ? "Attendance" : t.exams?.name ?? "Annual result",
  }));
}
export type ConfirmedTopper = Awaited<ReturnType<typeof listConfirmedToppers>>[number];

/** The year's start and end of a class (for the toppers page's periods). */
export async function classYearRange(user: Viewer, classId: string) {
  const { data } = await queryAs(user).from("classes").select("academic_years(start_date, end_date)").eq("id", classId).maybeSingle();
  return data?.academic_years ?? null;
}

/**
 * Confirms the calculated toppers. The values are worked out again here, never taken from the
 * browser. Admins only; replaces an earlier confirmation of the same comparison.
 */
export async function confirmToppers(user: Viewer, q: TopperQuery): Promise<{ confirmed: number; names: string[] }> {
  requireRole(user, "headmaster");
  await assertTeacherOfClass(user, q.classId);
  const outcome = await computeToppers(user, q);
  if (!outcome) throw new UserError("That class or exam is not available.");
  if (!outcome.toppers.length) throw new UserError(outcome.note ?? "There is no topper to confirm.");
  const { data, error } = await queryAs(user).call((db) => db.confirmToppers(outcome.scope,
    outcome.toppers.map((t) => ({ student_id: t.id, value: t.value }))));
  if (error) throw error;
  return { confirmed: data, names: outcome.toppers.map((t) => t.name) };
}

/** Replaces the whole grade scale (checked: 0-100, no gaps or overlaps). Admins only. */
export async function saveGradeScale(user: Viewer, bands: GradeBand[]): Promise<void> {
  requireRole(user, "headmaster");
  const { error } = await queryAs(user).call((db) => db.replaceGradeScales(bands));
  if (error) throw error;
}

/** How many of a period's Sundays must have had attendance for an attendance topper. Admins. */
export async function saveTopperSettings(user: Viewer, data: { attendance_topper_min_pct: number }): Promise<void> {
  requireRole(user, "headmaster");
  const { error } = await queryAs(user).from("school_settings").update(data).eq("id", 1);
  if (error) throw error;
}