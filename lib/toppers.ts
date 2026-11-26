/**
 * Toppers (pure, unit-tested).
 * - Class topper: the highest percentage among students who sat the exam(s) and passed every
 *   subject. Equal best percentages give joint toppers.
 * - Attendance topper: the highest attendance % in the period, where
 *   attendance % = (present + late) / sessions held x 100 and sessions held = the days attendance
 *   was taken for the class. The class must have held at least `minPct` % of the period's Sundays,
 *   else there is no attendance topper. Equal best percentages give joint toppers.
 */
import { round2 } from "./grades";

export type Candidate = { id: string; name: string; admissionNo: string; value: number | null; eligible: boolean };
export type Ranked = Candidate & { value: number; place: number };

/** Joint toppers and the top `n` (ranked 1, 1, 3), among eligible candidates with a value. */
export function pickToppers(candidates: Candidate[], n = 5): { toppers: Ranked[]; top: Ranked[] } {
  const ok = candidates.filter((c): c is Candidate & { value: number } => c.eligible && c.value !== null)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const ranked: Ranked[] = [];
  ok.forEach((c, i) => ranked.push({ ...c, place: i > 0 && ok[i - 1].value === c.value ? ranked[i - 1].place : i + 1 }));
  return {
    toppers: ranked.filter((r) => r.place === 1),
    top: ranked.filter((r) => r.place <= n),
  };
}

/** (present + late) / sessions held x 100, 2 decimals. */
export function attendancePercent(present: number, late: number, sessionsHeld: number): number | null {
  return sessionsHeld > 0 ? round2(((present + late) / sessionsHeld) * 100) : null;
}

/** Sundays from `from` to `to` (YYYY-MM-DD, both included). */
export function sundaysBetween(from: string, to: string): number {
  if (to < from) return 0;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const firstSunday = new Date(start.getTime() + ((7 - start.getUTCDay()) % 7) * 864e5);
  if (firstSunday > end) return 0;
  return Math.floor((end.getTime() - firstSunday.getTime()) / (7 * 864e5)) + 1;
}

/** Enough classes held for an attendance topper: at least minPct % of the period's Sundays. */
export function enoughSessions(sessionsHeld: number, sundays: number, minPct: number): boolean {
  if (sundays === 0) return sessionsHeld > 0;
  return sessionsHeld * 100 >= minPct * sundays;
}
