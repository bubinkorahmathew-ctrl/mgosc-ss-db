/**
 * A throwaway TiDB database per test file, loaded with the same fixture as the Postgres spec
 * (PGlite + supabase/migrations + seed, copied row by row, without any logins or passwords).
 *
 * It only ever drops the randomly named database that it created itself.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { createDb } from "@/lib/db/client";
import { createDatabase, createPool, executor, type Database, type TiDbConfig } from "@/lib/db/connection";
import { translateError } from "@/lib/db/errors";
import { COLUMNS, type TableName } from "@/lib/db/schema";
import { toDb } from "@/lib/db/values";
import { createTestDb, type TestDb } from "../db/harness";

export { IDS } from "../db/harness";

const root = path.resolve(__dirname, "..", "..");

function testConfig(): Omit<TiDbConfig, "database"> {
  const { TIDB_HOST, TIDB_PORT, TIDB_USER, TIDB_PASSWORD } = process.env;
  if (TIDB_HOST && TIDB_USER && TIDB_PASSWORD) {
    return { host: TIDB_HOST, port: Number(TIDB_PORT || 4000), user: TIDB_USER, password: TIDB_PASSWORD };
  }
  const file = path.join(root, "tibcloud.txt");
  if (!fs.existsSync(file)) throw new Error("Set TIDB_HOST, TIDB_USER and TIDB_PASSWORD to run the TiDB tests.");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const field = (k: string) => lines[lines.indexOf(`${k}:`) + 1];
  return { host: field("HOST"), port: Number(field("PORT")), user: field("USERNAME"), password: field("PASSWORD") };
}

const TABLES: TableName[] = [
  "profiles", "academic_years", "classes", "class_teachers", "students", "registrations", "registration_attempts",
  "subjects", "exams", "marks", "attendance", "activities", "certificates", "school_settings", "number_counters",
];

async function copyFixture(pg: TestDb, to: mysql.Connection) {
  await to.query("delete from school_settings"); // the migration's default row
  for (const table of TABLES) {
    const { rows } = await pg.query<{ j: Record<string, unknown> }>(`select to_jsonb(t) as j from public.${table} t`);
    if (!rows.length) continue;
    const names = Object.keys(COLUMNS[table]);
    await to.query(
      `insert into \`${table}\` (${names.map((c) => `\`${c}\``).join(", ")}) values ?`,
      [rows.map(({ j }) => names.map((c) => toDb(table, c, j[c] ?? null)))]);
  }
}

export async function createTiDbTest(extendFixture?: (pg: TestDb) => Promise<void>) {
  const pg = await createTestDb();
  await extendFixture?.(pg);

  const config = { ...testConfig(), database: `smdb_test_${randomBytes(6).toString("hex")}` };
  const connect = () => mysql.createConnection({
    host: config.host, port: config.port, user: config.user, password: config.password,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z", stringifyObjects: true,
  });
  const admin = await connect();
  await admin.query(`create database \`${config.database}\` character set utf8mb4 collate utf8mb4_bin`);

  const pool = createPool(config);
  const destroy = async () => {
    await pool.end().catch(() => {});
    // a new connection: TiDB Cloud closes idle ones, and a long test file leaves the first idle
    admin.destroy();
    const cleaner = await connect();
    await cleaner.query(`drop database if exists \`${config.database}\``);
    await cleaner.end();
    await pg.close();
  };

  try {
    await admin.query(`use \`${config.database}\``);
    await admin.query("set time_zone = '+00:00'");
    const dir = path.join(root, "tidb", "migrations");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8").replace(/--.*$/gm, "");
      for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean)) await admin.query(statement);
    }
    await copyFixture(pg, admin);
    // the spec's headmaster had every right: that is today's super admin
    await admin.query("update profiles set is_super = true where role = 'headmaster'");
  } catch (e) {
    await destroy();
    throw e;
  }

  const database = createDatabase(pool);

  /** Everything done through the returned Database disappears on end(). */
  async function sandbox() {
    const connection = await pool.getConnection();
    await connection.query("begin pessimistic");
    const direct = executor(connection);
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
        const name = `sp${++depth}`;
        await connection.query(`savepoint ${name}`);
        try {
          return await fn(direct);
        } catch (e) {
          await connection.query(`rollback to savepoint ${name}`);
          throw translateError(e);
        }
      },
    };
    return {
      database: scoped,
      raw: direct.query,
      as: (userId: string | null) => createDb(scoped, userId),
      end: async () => {
        await connection.query("rollback");
        connection.release();
      },
    };
  }

  return { pg, database, sandbox, destroy, name: config.database, as: (userId: string | null) => createDb(database, userId) };
}

export type TiDbTest = Awaited<ReturnType<typeof createTiDbTest>>;
export type Sandbox = Awaited<ReturnType<TiDbTest["sandbox"]>>;
