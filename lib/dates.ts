import { TIME_ZONE } from "@/lib/config";

/** Today's date (YYYY-MM-DD) in Asia/Kolkata, regardless of server time zone. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** DD/MM/YYYY for display. Accepts YYYY-MM-DD or a full ISO timestamp. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(value));
}

/**
 * Completed years and months between dob and `on` (both YYYY-MM-DD). Never stored: always
 * derived, the same way as the v_student_age view (MySQL TIMESTAMPDIFF). A 29 February
 * birthday counts as reached on 1 March in other years.
 */
export function ageParts(dob: string, on: string = todayISO()): { years: number; months: number } {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  const total = Math.max(0, (y - by) * 12 + (m - bm) - (d < bd ? 1 : 0));
  return { years: Math.floor(total / 12), months: total % 12 };
}

/** Whole years between dob and `on` (both YYYY-MM-DD). */
export function ageOn(dob: string, on: string = todayISO()): number {
  return ageParts(dob, on).years;
}

/** "9 y 4 m", or "9" when compact. */
export function formatAge(dob: string, on: string = todayISO(), compact = false): string {
  const { years, months } = ageParts(dob, on);
  return compact ? String(years) : `${years} y ${months} m`;
}
