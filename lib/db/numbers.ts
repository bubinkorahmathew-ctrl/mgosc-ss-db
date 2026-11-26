import type { Executor } from "./connection";
import { todayIST } from "./time";

export type CounterKind = "admission" | "certificate";

/** current_number_year(): start year of the current academic year, else this calendar year in IST. */
export async function currentNumberYear(db: Executor, now: Date): Promise<number> {
  const [year] = await db.query<{ start_date: string }>("select start_date from academic_years where is_current limit 1");
  return Number((year?.start_date ?? todayIST(now)).slice(0, 4));
}

/** Reserve `count` numbers and return the first. A rolled-back transaction gives them back. */
export async function reserveNumbers(tx: Executor, kind: CounterKind, year: number, count: number): Promise<number> {
  await tx.query(
    "insert into number_counters (name, `year`, `last_value`) values (?, ?, ?) on duplicate key update `last_value` = `last_value` + ?",
    [kind, year, count, count]);
  const [row] = await tx.query<{ v: number }>(
    "select `last_value` as v from number_counters where name = ? and `year` = ? for update", [kind, year]);
  return Number(row.v) - count + 1;
}

/** SS-2026-0001 / CERT-2026-0001. Grows past four digits instead of truncating as lpad() would. */
export function formatNumber(kind: CounterKind, year: number, n: number): string {
  return `${kind === "admission" ? "SS" : "CERT"}-${year}-${String(n).padStart(4, "0")}`;
}
