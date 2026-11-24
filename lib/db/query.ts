import "server-only";
/**
 * A small chainable query API over createDb(). It builds no SQL of its own: every read, join and
 * write goes through createDb, so the policies apply to each joined table separately.
 *
 * Expected failures (denied, duplicate, invalid input) come back as `error`. Infrastructure
 * failures are thrown, so an outage can't look like an empty list.
 */
import type { Db } from "./client";
import { DbError, invalid } from "./errors";
import { RELATIONS, type Shape } from "./query-types";
import { UPSERT_KEY, type Rows, type TableName } from "./schema";
import type { Condition, Order } from "./sql";
import { columnKind, type Row } from "./values";

type Result<D> = { data: D; error: null; count: number | null } | { data: null; error: DbError; count: null };
type Compare = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
type One<D> = D extends (infer E)[] ? E : never;

type Field =
  | { column: string }
  | { name: string; target: string; inner: boolean; body: string };

export function parseSelect(text: string): Field[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => {
    const p = part.trim();
    const open = p.indexOf("(");
    if (open < 0) return { column: p };
    const [left, right] = p.slice(0, open).split(":");
    const [target, hint] = (right ?? left).split("!");
    return { name: right ? left : target, target, inner: hint === "inner", body: p.slice(open + 1, -1) };
  });
}

type AnyRelation = { table: TableName; one?: string; many?: string };

function relation(table: TableName, target: string): AnyRelation {
  const all = RELATIONS as unknown as Partial<Record<TableName, Record<string, AnyRelation>>>;
  const found = Object.hasOwn(all, table) && Object.hasOwn(all[table]!, target) ? all[table]![target] : undefined;
  if (!found) throw invalid(`no relation from ${table} to ${target}`);
  return found;
}

/** Keep the requested columns and attach joins, each read as the caller. */
async function project(db: Db, table: TableName, rows: Row[], fields: Field[]): Promise<Row[]> {
  const out: Row[] = rows.map(() => ({}));
  const joins: Promise<void>[] = [];

  for (const field of fields) {
    if ("column" in field) {
      if (field.column === "*") rows.forEach((r, i) => Object.assign(out[i], r));
      else {
        columnKind(table, field.column);
        rows.forEach((r, i) => (out[i][field.column] = r[field.column]));
      }
      continue;
    }
    const rel = relation(table, field.target);
    joins.push((async () => {
      const from = rel.one ?? "id";
      const to = rel.one ? "id" : rel.many!;
      const keys = [...new Set(rows.map((r) => r[from]).filter((v) => v !== null && v !== undefined))];
      const related: Row[] = keys.length ? await db.select(rel.table, { where: [[to, "in", keys]] }) : [];
      const counting = field.body.trim() === "count";
      const shaped = counting ? related : await project(db, rel.table, related, parseSelect(field.body));
      const groups = new Map<unknown, Row[]>();
      related.forEach((r, i) => {
        const group = groups.get(r[to]);
        if (group) group.push(shaped[i]);
        else groups.set(r[to], [shaped[i]]);
      });
      rows.forEach((r, i) => {
        const group = groups.get(r[from]) ?? [];
        out[i][field.name] = counting ? [{ count: group.length }] : rel.one ? (group[0] ?? null) : group;
      });
    })());
  }
  await Promise.all(joins);
  return out;
}

type Write<T extends TableName> =
  | { op: "insert"; values: Partial<Rows[T]> | Partial<Rows[T]>[] }
  | { op: "upsert"; values: Partial<Rows[T]> | Partial<Rows[T]>[]; onConflict: string }
  | { op: "update"; values: Partial<Rows[T]> }
  | { op: "delete" };

class Query<T extends TableName, D> implements PromiseLike<Result<D>> {
  private fields: Field[] | null = null;
  private conditions: Condition[] = [];
  private joined: { name: string; column: string; value: unknown }[] = [];
  private sort: Order[] = [];
  private max?: number;
  private skip?: number;
  private counted = false;
  private head = false;
  private cardinality: "many" | "one" | "maybe" = "many";

  constructor(private db: Db, private table: T, private mutation: Write<T> | null = null) {}

  select<const S extends string>(columns: S, options?: { count?: "exact"; head?: boolean }): Query<T, Shape<T, S>[]> {
    this.fields = parseSelect(columns);
    this.counted = options?.count === "exact";
    this.head = !!options?.head;
    return this as unknown as Query<T, Shape<T, S>[]>;
  }

  private compare(op: Compare, column: string, value: unknown) {
    const [name, inner] = column.split(".");
    if (inner === undefined) this.conditions.push([name, op, value]);
    else if (op === "eq") this.joined.push({ name, column: inner, value });
    else throw invalid("only eq can filter on a joined table");
    return this;
  }
  eq(column: string, value: unknown) { return this.compare("eq", column, value); }
  neq(column: string, value: unknown) { return this.compare("neq", column, value); }
  gt(column: string, value: unknown) { return this.compare("gt", column, value); }
  gte(column: string, value: unknown) { return this.compare("gte", column, value); }
  lt(column: string, value: unknown) { return this.compare("lt", column, value); }
  lte(column: string, value: unknown) { return this.compare("lte", column, value); }

  in(column: string, values: readonly unknown[]) {
    this.conditions.push([column, "in", values]);
    return this;
  }
  is(column: string, value: null) {
    this.conditions.push([column, "is", value]);
    return this;
  }
  ilike(column: string, pattern: string) {
    this.conditions.push([column, "ilike", pattern]);
    return this;
  }
  /** Several conditions at once; every one must hold. */
  match(conditions: readonly Condition[]) {
    this.conditions.push(...conditions);
    return this;
  }
  /** Structured on purpose: there is no filter-string syntax for user input to break out of. */
  or(conditions: readonly Condition[]) {
    this.conditions.push({ or: conditions });
    return this;
  }
  order(column: string, options: Omit<Order, "column"> = {}) {
    this.sort.push({ column, ...options });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  range(from: number, to: number) {
    this.skip = from;
    this.max = to - from + 1;
    return this;
  }
  single(): Query<T, One<D>> {
    this.cardinality = "one";
    return this as unknown as Query<T, One<D>>;
  }
  maybeSingle(): Query<T, One<D> | null> {
    this.cardinality = "maybe";
    return this as unknown as Query<T, One<D> | null>;
  }

  private async write(m: Write<T>): Promise<Row[]> {
    const { db, table } = this;
    if (m.op === "insert") return db.insert(table, m.values);
    if (m.op === "update") return db.update(table, m.values, this.conditions);
    if (m.op === "delete") return db.delete(table, this.conditions);
    const key = UPSERT_KEY as Partial<Record<TableName, readonly string[]>>;
    if (key[table]?.join(",") !== m.onConflict.replace(/\s/g, "")) throw invalid("unsupported upsert key");
    return db.upsert(table as keyof typeof UPSERT_KEY, m.values as Partial<Rows["marks"]>[]);
  }

  private async run(): Promise<Result<D>> {
    try {
      const { db, table } = this;
      let count: number | null = null;
      let rows: Row[] = [];
      const fields = this.fields;
      const innerJoins = (fields ?? []).flatMap((f) => ("name" in f && f.inner ? [f.name] : []));

      if (this.mutation) {
        if (this.joined.length) throw invalid("a write can't filter on a joined table");
        rows = await this.write(this.mutation);
      } else {
        // these are filtered after the read, so a page or count taken before would be wrong
        if (this.joined.some((j) => !innerJoins.includes(j.name))) throw invalid("a joined filter needs !inner");
        if (innerJoins.length && (this.counted || this.max !== undefined)) throw invalid("!inner can't be paged or counted");
        const options = { where: this.conditions, order: this.sort, limit: this.max, offset: this.skip };
        const [found, total] = await Promise.all([
          this.head ? [] : db.select(table, options),
          this.counted ? db.count(table, this.conditions) : null,
        ]);
        rows = found;
        count = total;
      }

      if (!fields || this.head) return { data: null as D, error: null, count };
      let data = await project(db, table, rows, fields);
      if (!this.mutation && innerJoins.length) {
        data = data.filter((r) => innerJoins.every((name) => r[name] !== null)
          && this.joined.every((j) => (r[j.name] as Row)[j.column] === j.value));
      }
      if (this.cardinality === "many") return { data: data as D, error: null, count };
      if (data.length > 1 || (this.cardinality === "one" && !data.length)) {
        throw new DbError("expected exactly one row", "P0001");
      }
      return { data: (data[0] ?? null) as D, error: null, count };
    } catch (e) {
      if (e instanceof DbError) return { data: null, error: e, count: null };
      throw e;
    }
  }

  then<A = Result<D>, B = never>(
    onFulfilled?: ((value: Result<D>) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.run().then(onFulfilled, onRejected);
  }
}

export function createQueryClient(db: Db) {
  return {
    from<T extends TableName>(table: T) {
      return {
        select: <const S extends string>(columns: S, options?: { count?: "exact"; head?: boolean }) =>
          new Query<T, null>(db, table).select(columns, options),
        insert: (values: Partial<Rows[T]> | Partial<Rows[T]>[]) => new Query<T, null>(db, table, { op: "insert", values }),
        upsert: (values: Partial<Rows[T]> | Partial<Rows[T]>[], options: { onConflict: string }) =>
          new Query<T, null>(db, table, { op: "upsert", values, onConflict: options.onConflict }),
        update: (values: Partial<Rows[T]>) => new Query<T, null>(db, table, { op: "update", values }),
        delete: () => new Query<T, null>(db, table, { op: "delete" }),
      };
    },
    /** A named database function, with expected failures returned like a query's. */
    async call<R>(fn: (db: Db) => Promise<R>): Promise<Result<R>> {
      try {
        return { data: await fn(db), error: null, count: null };
      } catch (e) {
        if (e instanceof DbError) return { data: null, error: e, count: null };
        throw e;
      }
    },
  };
}
