/**
 * Gap-free yearly numbers: SS-2026-0001 (admission), CERT-2026-0001, RCT-2026-0001 (receipt),
 * PAY-2026-0001 (payment voucher). Always called inside the transaction that saves the numbered
 * rows, so a rollback gives the numbers back and concurrent saves never get the same one.
 */
import { and, eq, sql } from "drizzle-orm";
import type { MySqlDatabase } from "drizzle-orm/mysql-core";
import { numberCounters } from "./schema";

export type CounterName = "admission" | "certificate" | "receipt" | "payment";

export const NUMBER_PREFIX: Record<CounterName, string> = {
  admission: "SS", certificate: "CERT", receipt: "RCT", payment: "PAY",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle MySQL driver or transaction
type Tx = MySqlDatabase<any, any, any, any>;

/** Reserve `count` numbers of `name` for `year` and return the first. Needs a transaction. */
export async function reserveNumbers(tx: Tx, name: CounterName, year: number, count = 1): Promise<number> {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("count must be a positive whole number");
  // make sure the row exists, then lock it: other savers wait here until this transaction ends
  await tx.insert(numberCounters).values({ name, year, lastValue: 0 })
    .onDuplicateKeyUpdate({ set: { name: sql`${numberCounters.name}` } });
  const [row] = await tx.select({ last: numberCounters.lastValue }).from(numberCounters)
    .where(and(eq(numberCounters.name, name), eq(numberCounters.year, year))).for("update");
  await tx.update(numberCounters).set({ lastValue: row.last + count })
    .where(and(eq(numberCounters.name, name), eq(numberCounters.year, year)));
  return row.last + 1;
}

/** RCT-2026-0001. Grows past four digits instead of truncating. */
export function formatNumber(name: CounterName, year: number, n: number): string {
  return `${NUMBER_PREFIX[name]}-${year}-${String(n).padStart(4, "0")}`;
}
