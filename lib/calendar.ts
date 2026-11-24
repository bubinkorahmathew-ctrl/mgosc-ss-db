/** Month helpers for the attendance calendars. Months are "YYYY-MM", dates "YYYY-MM-DD". */

const pad = (n: number) => String(n).padStart(2, "0");

/** Days of a month laid out Sunday-first, with blanks before the 1st. */
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** Attended share of one day's marks, as a whole percentage. Late counts as attended. */
export function dayPercent(marked: number, attended: number): number | null {
  return marked ? Math.round((attended / marked) * 100) : null;
}
