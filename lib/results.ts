/**
 * Exam result maths (pure, unit-tested).
 * - Every exam uses all subjects.
 * - Percentage is over the subjects that have marks for that student.
 * - Rank: standard competition ranking by percentage (1, 1, 3); students without marks get no rank.
 */
export type ResultSubject = { id: string; name: string; max: number };
export type ResultStudent = { id: string; name: string; nameMl: string | null; admissionNo: string };
export type ResultMark = { student_id: string; subject_id: string; marks_obtained: number };

export type StudentResult = ResultStudent & {
  marks: Record<string, number | null>;
  total: number;
  max: number;
  /** 0-100, null when no marks */
  percentage: number | null;
  rank: number | null;
  subjectsEntered: number;
};

export function computeResults(students: ResultStudent[], subjects: ResultSubject[], marks: ResultMark[]): StudentResult[] {
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  const byStudent = new Map<string, Map<string, number>>();
  for (const m of marks) {
    if (!bySubject.has(m.subject_id)) continue;
    let row = byStudent.get(m.student_id);
    if (!row) byStudent.set(m.student_id, (row = new Map()));
    row.set(m.subject_id, Number(m.marks_obtained));
  }

  const rows: StudentResult[] = students.map((s) => {
    const own = byStudent.get(s.id) ?? new Map<string, number>();
    let total = 0, max = 0;
    const out: Record<string, number | null> = {};
    for (const sub of subjects) {
      const v = own.get(sub.id);
      out[sub.id] = v ?? null;
      if (v !== undefined) { total += v; max += sub.max; }
    }
    total = round2(total);
    return {
      ...s, marks: out, total, max,
      percentage: max > 0 ? round2((total / max) * 100) : null,
      rank: null, subjectsEntered: own.size,
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
