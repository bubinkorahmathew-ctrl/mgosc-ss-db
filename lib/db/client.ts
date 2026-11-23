import "server-only";
import { randomUUID } from "node:crypto";
import type { Database, Executor } from "./connection";
import { DbError, denied, invalid, noPrivilege } from "./errors";
import { createFunctions } from "./functions";
import {
  canWrite, INTERNAL_TABLES, lockActor, readable, targetable, type Actor, type Facts,
} from "./policies";
import { applyUpdateRules, completeCertificates, completeStudents, forceInsertValues, loadFacts, validateRows } from "./rules";
import { COLUMNS, PRIMARY_KEY, UPSERT_KEY, type Rows, type TableName } from "./schema";
import { column, orderBy, scoped, type Condition, type Order } from "./sql";
import { fromDb, toDbRow, toId, type Row } from "./values";

const MAX_BATCH = 5000;

export type SelectOptions = {
  where?: readonly Condition[];
  order?: readonly Order[];
  limit?: number;
  offset?: number;
};

/**
 * The only way app code reads or writes TiDB. `userId` must come from a verified session,
 * never from request input. null is an anonymous visitor.
 */
export function createDb(database: Database, userId: string | null) {
  const uid = userId === null ? null : toId(userId);

  function guard(table: TableName) {
    if (!Object.hasOwn(COLUMNS, table)) throw invalid("unknown table");
    if (INTERNAL_TABLES.has(table)) throw noPrivilege(table);
  }

  const columnsOf = (table: TableName) => Object.keys(COLUMNS[table]).map((c) => `t.${column(table, c)}`).join(", ");

  async function select<T extends TableName>(table: T, options: SelectOptions = {}): Promise<Rows[T][]> {
    guard(table);
    const where = scoped(table, readable(table, uid), options.where);
    let sql = `select ${columnsOf(table)} from \`${table}\` t where ${where.sql}${orderBy(table, options.order)}`;
    const { limit, offset } = options;
    for (const n of [limit, offset]) {
      if (n !== undefined && (!Number.isSafeInteger(n) || n < 0)) throw invalid("invalid page");
    }
    if (limit !== undefined || offset) sql += ` limit ${limit ?? Number.MAX_SAFE_INTEGER} offset ${offset ?? 0}`;
    const rows = await database.query(sql, where.params);
    return rows.map((r) => fromDb(table, r)) as unknown as Rows[T][];
  }

  async function count(table: TableName, conditions?: readonly Condition[]): Promise<number> {
    guard(table);
    const where = scoped(table, readable(table, uid), conditions);
    const [row] = await database.query<{ n: number }>(`select count(*) as n from \`${table}\` t where ${where.sql}`, where.params);
    return Number(row.n);
  }

  /** RETURNING: what was written, as far as the caller may read it, in input order. */
  async function returning<T extends TableName>(tx: Executor, table: T, rows: Row[]): Promise<Rows[T][]> {
    if (!rows.length) return [];
    const keys = PRIMARY_KEY[table];
    const target = keys.length === 1 ? `t.${column(table, keys[0])}` : `(${keys.map((k) => `t.${column(table, k)}`).join(", ")})`;
    const wanted = rows.map((r) => (keys.length === 1 ? r[keys[0]] : keys.map((k) => r[k])));
    const policy = readable(table, uid);
    // for update = read our own write at the latest version
    const found = await tx.query(
      `select ${columnsOf(table)} from \`${table}\` t where (${policy.sql}) and ${target} in (?) for update`,
      [...policy.params, wanted]);
    const key = (r: Row) => keys.map((k) => r[k]).join("|");
    const byKey = new Map(found.map((r) => [key(r), r]));
    const ordered: Row[] = rows.flatMap((r) => {
      const hit = byKey.get(key(r));
      return hit ? [hit] : [];
    });
    return ordered.map((r) => fromDb(table, r)) as unknown as Rows[T][];
  }

  function authorise(op: "insert" | "update", table: TableName, rows: Row[], actor: Actor, facts: Facts) {
    if (!rows.every((r) => canWrite(op, table, r, actor, facts))) throw denied(table);
  }

  function prepare(table: TableName, input: unknown): Row[] {
    guard(table);
    const list: unknown[] = Array.isArray(input) ? input : [input];
    if (list.length > MAX_BATCH) throw invalid("too many rows");
    return list.map((r) => {
      const row = toDbRow(table, r);
      // ids are ours, except a profile's, which is the login's id
      if (table === "profiles") row.id = toId(row.id);
      else if (Object.hasOwn(COLUMNS[table], "id") && table !== "school_settings") row.id = randomUUID();
      return row;
    });
  }

  async function write(tx: Executor, table: TableName, rows: Row[], onDuplicate = "") {
    // rows with the same columns share one statement; omitted columns keep their defaults
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const signature = Object.keys(row).sort().join(",");
      groups.set(signature, [...(groups.get(signature) ?? []), row]);
    }
    for (const group of groups.values()) {
      const names = Object.keys(group[0]).sort();
      await tx.query(
        `insert into \`${table}\` (${names.map((c) => column(table, c)).join(", ")}) values ?${onDuplicate}`,
        [group.map((r) => names.map((c) => r[c]))]);
    }
  }

  async function insert<T extends TableName>(table: T, values: Partial<Rows[T]> | Partial<Rows[T]>[]): Promise<Rows[T][]> {
    const input = prepare(table, values);
    if (!input.length) return [];
    return database.transaction(async (tx) => {
      const now = new Date();
      const rows = input.map((r) => ({ ...r })); // a retry must start from the caller's values
      const actor = await lockActor(tx, uid);
      const facts = await loadFacts(tx, table, rows);
      for (const row of rows) forceInsertValues(table, row, actor, facts, now);
      authorise("insert", table, rows, actor, facts);
      await validateRows(tx, table, rows, facts, null);
      if (table === "certificates") await completeCertificates(tx, rows, facts, now);
      if (table === "students") await completeStudents(tx, rows, actor, now);
      await write(tx, table, rows);
      return returning(tx, table, rows);
    });
  }

  async function upsert<T extends keyof typeof UPSERT_KEY>(
    table: T, values: Partial<Rows[T]> | Partial<Rows[T]>[],
  ): Promise<Rows[T][]> {
    if (!Object.hasOwn(UPSERT_KEY, table)) throw invalid("upsert is not supported for this table");
    const keys: readonly string[] = UPSERT_KEY[table];
    const input = prepare(table, values);
    if (!input.length) return [];
    const key = (r: Row) => keys.map((k) => r[k]).join("|");
    const signature = (r: Row) => Object.keys(r).sort().join(",");
    if (input.some((r) => keys.some((k) => r[k] === undefined))) throw invalid("upsert needs its key columns");
    if (input.some((r) => signature(r) !== signature(input[0]))) throw invalid("upsert rows need the same columns");
    if (new Set(input.map(key)).size !== input.length) throw invalid("upsert contains the same row twice");

    return database.transaction(async (tx) => {
      const now = new Date();
      const rows = input.map((r) => ({ ...r }));
      const actor = await lockActor(tx, uid);
      const facts = await loadFacts(tx, table, rows); // also serialises writers of the same student
      for (const row of rows) forceInsertValues(table, row, actor, facts, now);
      authorise("insert", table, rows, actor, facts);
      await validateRows(tx, table, rows, facts, null);

      const tuple = `(${keys.map((k) => `t.${column(table, k)}`).join(", ")})`;
      const wanted = rows.map((r) => keys.map((k) => r[k]));
      const existing = await tx.query(`select ${columnsOf(table)} from \`${table}\` t where ${tuple} in (?) for update`, [wanted]);
      if (existing.length) {
        // ON CONFLICT DO UPDATE needs UPDATE rights on the row that is already there
        const policy = targetable("update", table, actor);
        const allowed = await tx.query(
          `select t.id from \`${table}\` t where (${policy.sql}) and t.id in (?) for update`,
          [...policy.params, existing.map((r) => r.id)]);
        if (allowed.length !== existing.length) throw denied(table);
        const byKey = new Map(rows.map((r) => [key(r), r]));
        const merged = existing.map((r) => ({ ...r, ...byKey.get(key(r)), id: r.id }));
        authorise("update", table, merged, actor, facts);
        for (const row of rows) row.id = existing.find((e) => key(e) === key(row))?.id ?? row.id;
      }

      const updated = Object.keys(rows[0]).filter((c) => c !== "id" && !keys.includes(c));
      if (!updated.length) throw invalid("upsert has nothing to set");
      await write(tx, table, rows,
        ` on duplicate key update ${updated.map((c) => `${column(table, c)} = values(${column(table, c)})`).join(", ")}`);
      return returning(tx, table, rows);
    });
  }

  async function update<T extends TableName>(
    table: T, values: Partial<Rows[T]>, conditions: readonly Condition[],
  ): Promise<Rows[T][]> {
    guard(table);
    if (PRIMARY_KEY[table].length !== 1) throw invalid(`${table} rows are inserted or deleted, not updated`);
    const patch = toDbRow(table, values);
    if (!Object.keys(patch).length) throw invalid("nothing to update");
    if (!conditions.length) throw invalid("update needs a filter");

    return database.transaction(async (tx) => {
      const actor = await lockActor(tx, uid);
      const where = scoped(table, targetable("update", table, actor), conditions);
      const before = await tx.query(`select ${columnsOf(table)} from \`${table}\` t where ${where.sql} for update`, where.params);
      if (!before.length) return [];

      const set = applyUpdateRules(table, before, patch, actor, new Date());
      const after = before.map((r) => ({ ...r, ...set }));
      const facts = await loadFacts(tx, table, after);
      authorise("update", table, after, actor, facts);
      await validateRows(tx, table, after, facts, new Set(Object.keys(set)));

      const names = Object.keys(set);
      if (names.length) {
        await tx.query(
          `update \`${table}\` set ${names.map((c) => `${column(table, c)} = ?`).join(", ")} where id in (?)`,
          [...names.map((c) => set[c]), before.map((r) => r.id)]);
      }
      return returning(tx, table, after);
    });
  }

  async function remove<T extends TableName>(table: T, conditions: readonly Condition[]): Promise<Rows[T][]> {
    guard(table);
    if (!conditions.length) throw invalid("delete needs a filter");
    return database.transaction(async (tx) => {
      const actor = await lockActor(tx, uid);
      const where = scoped(table, targetable("delete", table, actor), conditions);
      const before = await tx.query(`select ${columnsOf(table)} from \`${table}\` t where ${where.sql} for update`, where.params);
      if (!before.length) return [];
      const keys = PRIMARY_KEY[table];
      const target = keys.length === 1 ? column(table, keys[0]) : `(${keys.map((k) => column(table, k)).join(", ")})`;
      const wanted = before.map((r) => (keys.length === 1 ? r[keys[0]] : keys.map((k) => r[k])));
      await tx.query(`delete from \`${table}\` where ${target} in (?)`, [wanted]);
      return before.map((r) => fromDb(table, r)) as unknown as Rows[T][];
    });
  }

  return { select, count, insert, upsert, update, delete: remove, ...createFunctions(database, uid) };
}

export type Db = ReturnType<typeof createDb>;
export { DbError };
