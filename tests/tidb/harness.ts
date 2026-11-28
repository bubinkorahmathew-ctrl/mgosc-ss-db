/**
 * A throwaway TiDB database per test file, built by the real migrations and loaded with the
 * fixture in fixture.json (3 staff, 3 classes, 10 students...; no logins or passwords). The
 * fixture was exported once from the original Postgres spec when Supabase was removed.
 *
 * It only ever drops the randomly named database that it created itself.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { connect } from "@tidbcloud/serverless";
import { drizzle } from "drizzle-orm/tidb-serverless";
import { migrate } from "drizzle-orm/tidb-serverless/migrator";
import { FATHER_NAME_PLACEHOLDER, NOT_ASSIGNED_PRAYER_UNIT } from "@/lib/config";
import { todayISO } from "@/lib/dates";
import { createDb } from "@/lib/db/client";
import { connectTiDb, createDatabase, executor, type Database, type Executor } from "@/lib/db/connection";
import { setTestDatabase } from "@/lib/db";
import { createDrizzle, setTestDrizzle } from "@/db/client";
import { translateError } from "@/lib/db/errors";
import { COLUMNS, type TableName } from "@/lib/db/schema";
import { toDb } from "@/lib/db/values";
import FIXTURE from "./fixture.json";
import FIXTURE_IDS from "./fixture-ids.json";

/** Fixed ids of the fixture rows (staff, classes, students, exams, subjects). */
export const IDS = FIXTURE_IDS;

const root = path.resolve(__dirname, "..", "..");

/** Until a test database exists, lib/repo must never fall through to DATABASE_URL (the live database). */
const NO_DATABASE: Database = {
  query: () => Promise.reject(new Error("no test database: call createTiDbTest() first")),
  transaction: () => Promise.reject(new Error("no test database: call createTiDbTest() first")),
};
setTestDatabase(NO_DATABASE);
setTestDrizzle(createDrizzle("mysql://no-test-database.invalid:4000/none"));

/** DATABASE_URL from the environment or .env.local: the test databases live on the same cluster. */
function serverUrl(): URL {
  const envFile = path.join(root, ".env.local");
  const local: Record<string, string | undefined> = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, "utf8")) : {};
  const url = process.env.DATABASE_URL || local.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or .env.local) to run the TiDB tests.");
  return new URL(url);
}
const TABLES = Object.keys(FIXTURE) as (keyof typeof FIXTURE & TableName)[];

/** A date n days before today (India time): teachers write attendance only 14 days back. */
export const daysAgo = (n: number) => new Date(Date.parse(todayISO()) - n * 864e5).toISOString().slice(0, 10);

/** An active prayer unit in every test database, for new students and registrations. */
export const PRAYER_UNIT = "70000000-0000-4000-8000-000000000001";

/** Columns added after the fixture was made: filled the way the migrations fill old rows. */
function tidbOnly(table: TableName, j: Record<string, unknown>): Record<string, unknown> {
  if (table === "attendance") return { updated_at: new Date().toISOString() };
  if (table === "marks") return { is_absent: false };
  if (table === "subjects") return { pass_percent: 40 };
  if (table === "exams") return { weight: 1 };
  if (table === "school_settings") return { attendance_topper_min_pct: 50, timezone: "Asia/Riyadh", currency_code: "SAR", currency_symbol: "SAR" };
  if (table === "number_counters") return { name: j.kind };
  if (table !== "students" && table !== "registrations") return {};
  return {
    prayer_unit_id: NOT_ASSIGNED_PRAYER_UNIT,
    father_name: j.father_name ?? FATHER_NAME_PLACEHOLDER,
    father_phone: j.father_phone ?? j.guardian_phone,
  };
}

async function copyFixture(to: Executor) {
  await to.query("delete from school_settings"); // the migration's default row
  for (const table of TABLES) {
    const rows = (FIXTURE[table] as Record<string, unknown>[]).map((j) => ({ j }));
    if (!rows.length) continue;
    const names = Object.keys(COLUMNS[table]);
    await to.query(
      `insert into \`${table}\` (${names.map((c) => `\`${c}\``).join(", ")}) values ?`,
      [rows.map(({ j }) => {
        const row = { ...j, ...tidbOnly(table, j) };
        return names.map((c) => toDb(table, c, row[c] ?? null));
      })]);
  }
  await to.query("insert into prayer_units (id, name) values (?, 'St. Thomas')", [PRAYER_UNIT]);
}

/** `extend`: extra rows for one test file, written with the fixture (MySQL statements). */
export async function createTiDbTest(extend?: (db: Executor) => Promise<void>) {
  const name = `smdb_test_${randomBytes(6).toString("hex")}`;
  const server = serverUrl();
  const at = (database: string) => Object.assign(new URL(server), { pathname: `/${database}` }).toString();
  // only ever runs "create database" and "drop database" for this random name
  const admin = executor(connectTiDb(server.toString()));
  await admin.query(`create database \`${name}\` character set utf8mb4 collate utf8mb4_bin`);
  const url = at(name);

  const destroy = async () => {
    setTestDatabase(NO_DATABASE);
setTestDrizzle(createDrizzle("mysql://no-test-database.invalid:4000/none"));
    await admin.query(`drop database if exists \`${name}\``);
  };

  try {
    const setup = executor(connectTiDb(url));
    // the same Drizzle migrations that build the real database
    await migrate(drizzle({ client: connect({ url }) }), { migrationsFolder: path.join(root, "db", "migrations") });
    await copyFixture(setup);
    await extend?.(setup);
    // the spec's headmaster had every right: that is today's super admin
    await setup.query("update profiles set is_super = true where role = 'headmaster'");
  } catch (e) {
    await destroy();
    throw e;
  }

  const database = createDatabase(url);
  // lib/repo, lib/authn and anything using getDatabase/getDb now work on this test database
  setTestDatabase(database);
  setTestDrizzle(createDrizzle(url));

  /** Everything done through the returned Database disappears on end(). */
  async function sandbox() {
    const tx = await connectTiDb(url).begin();
    const direct = executor(tx, { serial: true });
    let depth = 0;
    const scoped: Database = {
      async query(sql, params) {
        try {
          return await direct.query(sql, params);
        } catch (e) {
          throw translateError(e);
        }
      },
      async transaction(fn) {
        const savepoint = `sp${++depth}`;
        await direct.query(`savepoint ${savepoint}`);
        try {
          return await fn(direct);
        } catch (e) {
          await direct.query(`rollback to savepoint ${savepoint}`);
          throw translateError(e);
        }
      },
    };
    return {
      database: scoped,
      raw: direct.query,
      as: (userId: string | null) => createDb(scoped, userId),
      /** Points lib/repo at this sandbox until end(). */
      use: () => setTestDatabase(scoped),
      end: async () => {
        setTestDatabase(database);
        await tx.rollback();
      },
    };
  }
  return { database, sandbox, destroy, url, name, as: (userId: string | null) => createDb(database, userId) };
}

export type TiDbTest = Awaited<ReturnType<typeof createTiDbTest>>;
export type Sandbox = Awaited<ReturnType<TiDbTest["sandbox"]>>;
