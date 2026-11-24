/**
 * Exam result maths (pure, unit-tested).
 * - Every exam uses all subjects.
 * - Percentage is over the subjects that have marks for that student. A subject missed (AB)
 *   counts as 0 out of its maximum.
 * - A student absent for the whole exam has no total, percentage or rank: their result is Absent.
 * - Rank: standard competition ranking by percentage (1, 1, 3), among present students with marks.
 */
export type ResultSubject = { id: string; name: string; max: number };
export type ResultStudent = { id: string; name: string; nameMl: string | null; admissionNo: string; dob?: string };
export type ResultMark = { student_id: string; subject_id: string; marks_obtained: number; is_absent?: boolean };

/** A subject's entry: marks, "AB" for a missed subject, or null when nothing is entered. */
export type MarkCell = number | "AB" | null;

export type StudentResult = ResultStudent & {
  marks: Record<string, MarkCell>;
  total: number;
  max: number;
  /** 0-100, null when no marks or absent for the exam */
  percentage: number | null;
  rank: number | null;
  subjectsEntered: number;
  /** marked absent for the whole exam */
  examAbsent: boolean;
};

export function computeResults(
  students: ResultStudent[], subjects: ResultSubject[], marks: ResultMark[], examAbsent: ReadonlySet<string> = new Set(),
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
    const own = away ? new Map() : byStudent.get(s.id) ?? new Map<string, { value: number; absent: boolean }>();
    let total = 0, max = 0;
    const out: Record<string, MarkCell> = {};
    for (const sub of subjects) {
      const v = own.get(sub.id);
      out[sub.id] = v ? (v.absent ? "AB" : v.value) : null;
      if (v) { total += v.absent ? 0 : v.value; max += sub.max; }
    }
    total = round2(total);
    return {
      ...s, marks: out, total, max,
      percentage: max > 0 ? round2((total / max) * 100) : null,
      rank: null, subjectsEntered: own.size, examAbsent: away,
    };
  });

  const ranked = rows.filter((r) => r.percentage !== null).sort((a, b) => b.percentage! - a.percentage!);
  ranked.forEach((r, i) => {
    r.rank = i > 0 && ranked[i - 1].percentage === r.percentage ? ranked[i - 1].rank : i + 1;
  });
  return rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatPercent(p: number | null): string {
  return p === null ? "-" : `${p.toFixed(2)}%`;
}
