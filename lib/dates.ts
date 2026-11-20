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

/** Whole years between dob and `on` (both YYYY-MM-DD). */
export function ageOn(dob: string, on: string = todayISO()): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}
