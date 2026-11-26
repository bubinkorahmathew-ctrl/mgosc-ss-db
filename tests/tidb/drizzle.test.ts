/**
 * Phase S1 on a throwaway TiDB database built from db/migrations: the Drizzle schema matches the
 * database, numbering is safe under concurrent saves on the serverless (HTTP) driver, CHECK
 * constraints are enforced, and the age view uses the school's time zone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";
import { createDrizzle, type Db } from "@/db/client";
import { formatNumber, reserveNumbers } from "@/db/numbers";
import * as schema from "@/db/schema";
import { ageParts } from "@/lib/dates";
import { createTiDbTest, IDS, type TiDbTest } from "./harness";

let t: TiDbTest;
let db: Db;
beforeAll(async () => {
  t = await createTiDbTest();
  db = createDrizzle(t.url);
});
afterAll(async () => {
  await t?.destroy();
});

describe("schema files", () => {
  it("every table and column in db/schema exists in the migrated database, and nothing more", async () => {
    const rows = await t.database.query<{ t: string; c: string; n: string }>(
      "select table_name as t, column_name as c, is_nullable as n from information_schema.columns where table_schema = ? and table_name in (select table_name from information_schema.tables where table_schema = ? and table_type = 'BASE TABLE')",
      [t.name, t.name]);
    const real = new Map<string, string[]>();
    for (const r of rows) {
      if (r.t === "__drizzle_migrations") continue;
      real.set(r.t, [...(real.get(r.t) ?? []), `${r.c}:${r.n}`]);
    }
    const declared = new Map<string, string[]>();
    for (const value of Object.values(schema)) {
      if (!is(value, MySqlTable)) continue;
      declared.set(getTableName(value), Object.values(getTableColumns(value)).map((c) => `${c.name}:${c.notNull ? "NO" : "YES"}`));
    }
    expect([...declared.keys()].sort()).toEqual([...real.keys()].sort());
    for (const [table, columns] of declared) expect(columns.sort(), table).toEqual(real.get(table)!.sort());
  });
});

describe("numbers", () => {
  it("20 receipts saved at the same moment get 1 to 20, no gaps, no duplicates", async () => {
    const numbers = await Promise.all(Array.from({ length: 20 }, () =>
      db.transaction((tx) => reserveNumbers(tx, "receipt", 2026))));
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(formatNumber("receipt", 2026, numbers[0])).toMatch(/^RCT-2026-\d{4}$/);
    const [row] = await db.select().from(schema.numberCounters)
      .where(sql`${schema.numberCounters.name} = 'receipt' and ${schema.numberCounters.year} = 2026`);
    expect(row.lastValue).toBe(20);
  }, 120_000);

  it("a rolled-back save gives its number back; counters are per name and year", async () => {
    await expect(db.transaction(async (tx) => {
      await reserveNumbers(tx, "payment", 2026);
      throw new Error("save failed");
    })).rejects.toThrow("save failed");
    expect(await db.transaction((tx) => reserveNumbers(tx, "payment", 2026))).toBe(1);
    expect(await db.transaction((tx) => reserveNumbers(tx, "payment", 2027, 3))).toBe(1);
    expect(await db.transaction((tx) => reserveNumbers(tx, "payment", 2027))).toBe(4);
    expect(formatNumber("payment", 2026, 12345)).toBe("PAY-2026-12345");
  }, 60_000);
});

/** Drizzle reports "Failed query: ..." and keeps the database's own message in `cause`. */
async function refusedByCheck(query: PromiseLike<unknown>) {
  const error = await Promise.resolve(query).then(() => null, (e: unknown) => e as Error & { cause?: Error });
  expect(error, "the database accepted it").not.toBeNull();
  expect(`${error!.message} ${error!.cause?.message ?? ""}`).toMatch(/check constraint/i);
}

describe("CHECK constraints", () => {
  it("the database itself refuses out-of-range values", async () => {
    await refusedByCheck(db.insert(schema.subjects).values({ name: "Zero", maxMarks: 0 }));
    await refusedByCheck(db.insert(schema.subjects).values({ name: "Bad pass", maxMarks: 50, passPercent: 101 }));
    await refusedByCheck(db.insert(schema.marks).values({
      examId: IDS.examC1, studentId: IDS.studentC1, subjectId: IDS.subjectMV, marksObtained: -1,
    }));
    await refusedByCheck(db.insert(schema.marks).values({
      examId: IDS.examC1, studentId: IDS.studentC1, subjectId: IDS.subjectMV, marksObtained: 5, isAbsent: true,
    }));
    await refusedByCheck(db.insert(schema.gradeScales).values({ minPercent: 60, maxPercent: 50, grade: "Z" }));
    await refusedByCheck(db.insert(schema.prayerUnits).values({ name: "   " }));
    await refusedByCheck(db.insert(schema.schoolSettings).values({ id: 2, certificateWording: {} }));
  }, 60_000);
});

describe("views", () => {
  it("age is worked out in the school's time zone (Asia/Riyadh by default)", async () => {
    const [settings] = await db.select({ tz: schema.schoolSettings.timezone }).from(schema.schoolSettings);
    expect(settings.tz).toBe("Asia/Riyadh");
    const students = await db.select({ id: schema.students.id, dob: schema.students.dob }).from(schema.students).limit(5);
    const ages = await db.select().from(schema.vStudentAge);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
    for (const s of students) {
      const v = ages.find((a) => a.id === s.id)!;
      expect([Number(v.ageYears), Number(v.ageMonths)]).toEqual(Object.values(ageParts(s.dob, today)));
    }
  });

  it("RANK() works on TiDB: ties share a place and the next place is skipped", async () => {
    const rows = await t.database.query<{ x: number; r: number }>(
      "select x, rank() over (order by x desc) as r from (select 90 as x union all select 90 union all select 80) t order by r");
    expect(rows.map((r) => Number(r.r))).toEqual([1, 1, 3]);
  });
});
