/**
 * Grade scale (pure, unit-tested). Percentages have 2 decimals, so bands meet at x.99 / x+1.00:
 * 39.99 is F, 40.00 is D. The same lookup is in the v_subject_results / v_exam_results views.
 */
export type GradeBand = {
  min_percent: number; max_percent: number; grade: string;
  grade_point: number | null; remark: string | null; is_pass: boolean;
};

export const DEFAULT_SCALE: GradeBand[] = [
  { min_percent: 90, max_percent: 100, grade: "A+", grade_point: null, remark: null, is_pass: true },
  { min_percent: 80, max_percent: 89.99, grade: "A", grade_point: null, remark: null, is_pass: true },
  { min_percent: 70, max_percent: 79.99, grade: "B+", grade_point: null, remark: null, is_pass: true },
  { min_percent: 60, max_percent: 69.99, grade: "B", grade_point: null, remark: null, is_pass: true },
  { min_percent: 50, max_percent: 59.99, grade: "C", grade_point: null, remark: null, is_pass: true },
  { min_percent: 40, max_percent: 49.99, grade: "D", grade_point: null, remark: null, is_pass: true },
  { min_percent: 0, max_percent: 39.99, grade: "F", grade_point: null, remark: null, is_pass: false },
];

/** Hundredths as integers, so 89.99 + 0.01 is exactly 90.00. */
const cents = (n: number) => Math.round(n * 100);

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The band a percentage falls in (rounded to 2 decimals first), or null. */
export function gradeFor(percent: number | null, scale: readonly GradeBand[]): GradeBand | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  const p = cents(percent);
  let best: GradeBand | null = null;
  for (const b of scale) {
    if (p >= cents(b.min_percent) && p <= cents(b.max_percent) && (!best || b.min_percent > best.min_percent)) best = b;
  }
  return best;
}

/**
 * Problems with a scale, in plain words; empty when it is usable. The bands must cover 0 to 100
 * with no overlap and no gap: each band starts 0.01 above where the one below it ends.
 */
export function scaleProblems(scale: readonly GradeBand[]): string[] {
  const problems: string[] = [];
  if (!scale.length) return ["Add at least one grade."];
  const grades = new Set<string>();
  for (const b of scale) {
    const g = b.grade.trim();
    if (!g) problems.push("Every band needs a grade.");
    else if (grades.has(g.toLowerCase())) problems.push(`The grade ${g} appears twice.`);
    grades.add(g.toLowerCase());
    if (cents(b.min_percent) > cents(b.max_percent)) problems.push(`${g}: "from" is above "to".`);
    if (b.min_percent < 0 || b.max_percent > 100) problems.push(`${g}: percentages must be between 0 and 100.`);
  }
  const sorted = [...scale].sort((a, b) => a.min_percent - b.min_percent);
  if (cents(sorted[0].min_percent) !== 0) problems.push(`The lowest band must start at 0 (it starts at ${sorted[0].min_percent}).`);
  const top = sorted[sorted.length - 1];
  if (cents(top.max_percent) !== 10000) problems.push(`The highest band must end at 100 (it ends at ${top.max_percent}).`);
  for (let i = 1; i < sorted.length; i++) {
    const below = sorted[i - 1], above = sorted[i];
    const gap = cents(above.min_percent) - cents(below.max_percent);
    if (gap <= 0) problems.push(`${below.grade} and ${above.grade} overlap: ${below.grade} ends at ${below.max_percent}, ${above.grade} starts at ${above.min_percent}.`);
    else if (gap > 1) problems.push(`Gap between ${below.grade} (ends ${below.max_percent}) and ${above.grade} (starts ${above.min_percent}).`);
  }
  return [...new Set(problems)];
}

/** Passed a subject: at or above its pass mark (pass % of the maximum). AB is never a pass. */
export function passedSubject(obtained: number, max: number, passPercent: number): boolean {
  // compare in hundredths of a mark x 100, so 20 of 50 at 40% passes exactly
  return Math.round(obtained * 100) * 100 >= Math.round(passPercent * max * 100);
}
