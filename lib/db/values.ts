import { DbError, invalid } from "./errors";
import { COLUMNS, type Kind, type TableName } from "./schema";

export type Row = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toId(value: unknown): string {
  // $ in a JS regex without /m does not accept a trailing newline, and CHAR padding makes 'id ' = 'id' in SQL
  if (typeof value !== "string" || !UUID.test(value)) throw invalid("invalid id");
  return value.toLowerCase();
}

export function columnKind(table: TableName, column: string): Kind {
  if (!Object.hasOwn(COLUMNS, table)) throw invalid("unknown table");
  const cols = COLUMNS[table] as Record<string, Kind>;
  if (!Object.hasOwn(cols, column)) throw invalid(`unknown column of ${table}`);
  return cols[column];
}

/**
 * Strict on purpose: MySQL would silently accept '1' for an enum or turn 'abc' into a number in
 * a comparison, and the driver expands objects into SQL fragments.
 */
export function toDb(table: TableName, column: string, value: unknown): unknown {
  const kind = columnKind(table, column);
  const bad = () => invalid(`invalid value for ${table}.${column}`);
  if (typeof kind !== "string") {
    if (typeof value !== "string" || !kind.includes(value)) throw bad();
    return value;
  }
  if (value === null) {
    if (!kind.endsWith("?")) throw new DbError(`${table}.${column} is required`, "23502");
    return null;
  }
  switch (kind.replace("?", "")) {
    case "uuid":
      return toId(value);
    case "text":
      if (typeof value !== "string") throw bad();
      return value;
    case "bool":
      if (typeof value !== "boolean") throw bad();
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) throw bad();
      return value;
    case "int":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) throw bad();
      return value;
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad();
      const d = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw bad();
      return value;
    }
    case "time": {
      if (typeof value !== "string" && !(value instanceof Date)) throw bad();
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw bad();
      return d;
    }
    case "json":
      if (typeof value !== "object") throw bad();
      return JSON.stringify(value);
    default:
      throw bad();
  }
}

/** Validate a caller-supplied row. `undefined` means "not provided". */
export function toDbRow(table: TableName, input: unknown): Row {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid(`invalid row for ${table}`);
  const out: Row = {};
  for (const [column, value] of Object.entries(input)) {
    const checked = value === undefined ? undefined : toDb(table, column, value);
    if (checked !== undefined) out[column] = checked;
  }
  return out;
}

/** Shape rows the way the app already expects: booleans, ISO timestamps, YYYY-MM-DD dates. */
export function fromDb(table: TableName, row: Row): Row {
  const out: Row = {};
  for (const [column, value] of Object.entries(row)) {
    const kind = columnKind(table, column);
    out[column] = value === null ? null
      : kind === "bool" ? Boolean(value)
      : value instanceof Date ? value.toISOString()
      : value;
  }
  return out;
}
