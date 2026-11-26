/**
 * Exam result maths (pure, unit-tested). Mirrors the v_subject_results / v_exam_results views.
 * - Every exam uses all subjects.
 * - Percentage is over the subjects that have marks for that student. A subject missed (AB)
 *   counts as 0 out of its maximum.
 * - A student absent for the whole exam has no total, percentage or rank: their result is Absent.
 * - Result: Fail if any subject is below its pass mark or AB; Pass when every subject is entered
 *   and passed; otherwise none yet (marks still being entered).
 * - Rank: standard competition ranking by percentage (1, 1, 3), among present students with marks.
 * Never stored: always derived from the marks.
 */
import { gradeFor, passedSubject, round2, type GradeBand } from "./grades";

export type ResultSubject = { id: string; name: string; max: number; passPercent?: number };
export type ResultStudent = { id: string; name: string; nameMl: string | null; admissionNo: string; dob?: string };
export type ResultMark = { student_id: string; subject_id: string; marks_obtained: number; is_absent?: boolean };

/** A subject's entry: marks, "AB" for a missed subject, or null when nothing is entered. */
export type MarkCell = number | "AB" | null;
export type ExamResult = "Pass" | "Fail" | "Absent";

export const DEFAULT_PASS_PERCENT = 40;

export type StudentResult = ResultStudent & {
  marks: Record<string, MarkCell>;
  /** each subject's grade ("AB" for a missed subject), null when not entered */
  subjectGrades: Record<string, string | null>;
  /** subjects below their pass mark, or AB */
  failedSubjects: string[];
  total: number;
  max: number;
  /** 0-100, null when no marks or absent for the exam */
  percentage: number | null;
  grade: string | null;
  result: ExamResult | null;
  rank: number | null;
  subjectsEntered: number;
  /** marked absent for the whole exam */
  examAbsent: boolean;
};

export function computeResults(
  students: ResultStudent[], subjects: ResultSubject[], marks: ResultMark[],
  examAbsent: ReadonlySet<string> = new Set(), scale: readonly GradeBand[] = [],
): StudentResult[] {
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  const byStudent = new Map<string, Map<string, { value: number; absent: boolean }>>();
  for (const m of marks) {
    if (!bySubject.has(m.subject_id)) continue;
    let row = byStudent.get(m.student_id);
    if (!row) byStudent.set(m.student_id, (row = new Map()));
    row.set(m.subject_id, { value: Number(m.marks_obtained), absent: !!m.is_absent });
  }

  const rows: StudentResult[] = students.map((s) => {
    const away = examAbsent.has(s.id);
    const own = away ? new Map<string, { value: number; absent: boolean }>() : byStudent.get(s.id) ?? new Map();
    let total = 0, max = 0;
    const out: Record<string, MarkCell> = {};
    const grades: Record<string, string | null> = {};
    const failed: string[] = [];
    for (const sub of subjects) {
      const v = own.get(sub.id);
      out[sub.id] = v ? (v.absent ? "AB" : v.value) : null;
      grades[sub.id] = !v ? null : v.absent ? "AB" : gradeFor(round2((v.value / sub.max) * 100), scale)?.grade ?? null;
      if (v) {
        total += v.absent ? 0 : v.value;
        max += sub.max;
        if (v.absent || !passedSubject(v.value, sub.max, sub.passPercent ?? DEFAULT_PASS_PERCENT)) failed.push(sub.id);
      }
    }
    total = round2(total);
    const percentage = max > 0 ? round2((total / max) * 100) : null;
    const result: ExamResult | null = away ? "Absent"
      : !own.size ? null
      : failed.length ? "Fail"
      : own.size >= subjects.length ? "Pass"
      : null;
    return {
      ...s, marks: out, subjectGrades: grades, failedSubjects: failed, total, max, percentage,
      grade: gradeFor(percentage, scale)?.grade ?? null, result,
      rank: null, subjectsEntered: own.size, examAbsent: away,
    };
  });

  rankBy(rows, (r) => r.percentage);
  return rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
}

/** RANK(): ties share a place and the next place is skipped (1, 1, 3). Null values get no rank. */
export function rankBy<T extends { rank: number | null }>(rows: T[], value: (r: T) => number | null): void {
  const ranked = rows.filter((r) => value(r) !== null).sort((a, b) => value(b)! - value(a)!);
  ranked.forEach((r, i) => {
    r.rank = i > 0 && value(ranked[i - 1]) === value(r) ? ranked[i - 1].rank : i + 1;
  });
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatPercent(p: number | null): string {
  return p === null ? "-" : `${p.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------------------------
// Annual result: several exams of a year combined
// ---------------------------------------------------------------------------------------------

export type AnnualRow = ResultStudent & {
  /** each exam's percentage; null when absent or no marks */
  exams: Record<string, number | null>;
  percentage: number | null;
  grade: string | null;
  result: ExamResult | null;
  rank: number | null;
  /** sat every exam and passed each */
  passedAll: boolean;
};

/**
 * Average of the exams' percentages, weighted by each exam's weight (all 1 = a plain average),
 * over the exams the student has a percentage for. Pass needs a Pass in every chosen exam;
 * Absent when absent from all of them.
 */
export function computeAnnual(
  perExam: { examId: string; weight: number; results: StudentResult[] }[], scale: readonly GradeBand[] = [],
): AnnualRow[] {
  const students = new Map<string, ResultStudent>();
  for (const e of perExam) for (const r of e.results) {
    if (!students.has(r.id)) students.set(r.id, { id: r.id, name: r.name, nameMl: r.nameMl, admissionNo: r.admissionNo, dob: r.dob });
  }
  const rows: AnnualRow[] = [...students.values()].map((s) => {
    let sum = 0, weights = 0;
    const exams: Record<string, number | null> = {};
    const outcomes: (ExamResult | null)[] = [];
    for (const e of perExam) {
      const r = e.results.find((x) => x.id === s.id);
      exams[e.examId] = r?.percentage ?? null;
      outcomes.push(r?.result ?? null);
      if (r?.percentage != null && e.weight > 0) { sum += r.percentage * e.weight; weights += e.weight; }
    }
    const percentage = weights > 0 ? round2(sum / weights) : null;
    const passedAll = outcomes.length > 0 && outcomes.every((o) => o === "Pass");
    const result: ExamResult | null = outcomes.every((o) => o === "Absent") ? "Absent"
      : passedAll ? "Pass"
      : outcomes.some((o) => o === "Fail" || o === "Absent") ? "Fail"
      : null;
    return { ...s, exams, percentage, grade: gradeFor(percentage, scale)?.grade ?? null, result, rank: null, passedAll };
  });
  rankBy(rows, (r) => r.percentage);
  return rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
}
