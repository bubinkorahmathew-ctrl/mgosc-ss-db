import { invalid } from "./errors";
import { PRIMARY_KEY, type TableName } from "./schema";
import type { Sql } from "./policies";
import { columnKind, toDb } from "./values";

type Compare = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
export type Condition =
  | readonly [column: string, op: Compare, value: unknown]
  | readonly [column: string, op: "in", values: readonly unknown[]]
  | readonly [column: string, op: "ilike", pattern: string]
  | readonly [column: string, op: "is", value: null]
  | { readonly or: readonly Condition[] }
  | { readonly and: readonly Condition[] };

export type Order = { column: string; ascending?: boolean; nullsFirst?: boolean };

const OPERATOR: Record<Compare, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

export function column(table: TableName, name: string): string {
  columnKind(table, name); // throws unless whitelisted
  return `\`${name}\``;
}

function condition(table: TableName, c: Condition): Sql {
  if ("or" in c) return join(table, c.or, "or", "1=0");
  if ("and" in c) return join(table, c.and, "and", "1=1");

  const [name, op, value] = c;
  const col = `t.${column(table, name)}`;
  const kind = columnKind(table, name);
  if (op === "is") {
    if (value !== null) throw invalid("is only supports null");
    return { sql: `${col} is null`, params: [] };
  }
  if (op === "in") {
    if (!Array.isArray(value)) throw invalid("in needs a list");
    if (!value.length) return { sql: "1=0", params: [] };
    const list = value.map((v) => toDb(table, name, v));
    if (list.includes(null)) throw invalid("use is for null");
    return { sql: `${col} in (?)`, params: [list] };
  }
  if (op === "ilike") {
    if ((kind !== "text" && kind !== "text?") || typeof value !== "string") throw invalid("ilike needs text");
    return { sql: `lower(${col}) like lower(?)`, params: [value] };
  }
  if (!Object.hasOwn(OPERATOR, op) || kind === "json" || value === null) throw invalid("unsupported filter");
  return { sql: `${col} ${OPERATOR[op]} ?`, params: [toDb(table, name, value)] };
}

function join(table: TableName, list: readonly Condition[], word: "and" | "or", empty: string): Sql {
  if (!list.length) return { sql: empty, params: [] };
  const parts = list.map((c) => condition(table, c));
  return { sql: `(${parts.map((p) => `(${p.sql})`).join(` ${word} `)})`, params: parts.flatMap((p) => p.params) };
}

/** The policy and the caller's filter are each bracketed, so an `or` can never widen the policy. */
export function scoped(table: TableName, policy: Sql, where: readonly Condition[] = []): Sql {
  const filter = join(table, where, "and", "1=1");
  return { sql: `(${policy.sql}) and (${filter.sql})`, params: [...policy.params, ...filter.params] };
}

/** Postgres ordering: nulls last ascending, first descending; names not split by upper/lower case. */
export function orderBy(table: TableName, order: readonly Order[] = []): string {
  const parts = order.flatMap(({ column: name, ascending = true, nullsFirst }) => {
    const col = `t.${column(table, name)}`;
    const dir = ascending ? "asc" : "desc";
    const kind = columnKind(table, name);
    const out: string[] = [];
    if (typeof kind === "string" && kind.endsWith("?")) {
      out.push(`(${col} is null) ${(nullsFirst ?? !ascending) ? "desc" : "asc"}`);
    }
    if (kind === "text" || kind === "text?") out.push(`lower(${col}) ${dir}`);
    out.push(`${col} ${dir}`);
    return out;
  });
  // stable pages
  for (const key of PRIMARY_KEY[table]) {
    if (!order.some((o) => o.column === key)) parts.push(`t.${column(table, key)} asc`);
  }
  return ` order by ${parts.join(", ")}`;
}
