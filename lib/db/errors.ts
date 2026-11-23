/**
 * Errors of the TiDB data layer. Codes follow Postgres SQLSTATEs and the messages keep the
 * phrases lib/action-result.ts recognises. Driver messages are never passed on: they can
 * contain row values (names, phone numbers).
 */
export type DbErrorCode = "42501" | "23502" | "23503" | "23505" | "23514" | "22P02" | "22001" | "P0001";

export class DbError extends Error {
  constructor(message: string, readonly code: DbErrorCode) {
    super(message);
    this.name = "DbError";
  }
}

export const denied = (table: string) =>
  new DbError(`blocked by row-level security policy for table "${table}"`, "42501");
export const noPrivilege = (table: string) => new DbError(`permission denied for table ${table}`, "42501");
export const notAllowed = (message = "not allowed") => new DbError(message, "42501");
export const invalid = (message: string) => new DbError(message, "22P02");
export const violates = (message: string) => new DbError(message, "23514");

/** Map MySQL/TiDB error numbers to DbError. Anything unknown is returned unchanged. */
export function translateError(e: unknown): unknown {
  switch ((e as { errno?: number } | null)?.errno) {
    case 1062: return new DbError("duplicate key value violates a unique constraint", "23505");
    case 1216: case 1217: case 1451: case 1452:
      return new DbError("violates a foreign key constraint", "23503");
    case 1048: case 1364: return new DbError("a required value is missing", "23502");
    case 1406: return new DbError("value is too long", "22001");
    case 1264: case 1265: case 1366: return invalid("value is out of range or malformed");
    default: return e;
  }
}
