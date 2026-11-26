import "server-only";
import { connect, type Decoders } from "@tidbcloud/serverless";
// only the statement formatter: the same escaping this layer has always used (no connection)
import { format } from "mysql2";
import { translateError } from "./errors";
import type { Row } from "./values";

export interface Executor {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Executor {
  /** Everything inside runs in one transaction. `fn` may run again after a deadlock. */
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
}

/** Something that runs one statement: the serverless driver's connection or open transaction. */
type Runner = { execute(sql: string): Promise<unknown> };

const SYSTEM_SCHEMAS = ["sys", "mysql", "information_schema", "performance_schema", "metrics_schema"];

const utcDate = (value: string) => new Date(`${value.replace(" ", "T")}Z`);
const bytes = (hex: string) => Buffer.from(hex, "hex");

/**
 * Values come back the way the rules and the app expect (as mysql2 gave them): DATETIME as a
 * Date (stored in UTC), DATE as YYYY-MM-DD, DECIMAL and BIGINT as numbers, blobs as Buffers.
 */
const DECODERS: Decoders = {
  DATETIME: utcDate,
  TIMESTAMP: utcDate,
  DECIMAL: Number,
  BIGINT: Number,
  "UNSIGNED BIGINT": Number,
  BLOB: bytes,
  TINYBLOB: bytes,
  MEDIUMBLOB: bytes,
  LONGBLOB: bytes,
};

/** The serverless driver reports "Error 1062 (23000): ..."; the rules match on the number. */
export function withErrno(e: unknown): unknown {
  const message = (e as { message?: unknown } | null)?.message;
  const m = typeof message === "string" ? /Error (\d{4,5}) \(/.exec(message) : null;
  if (m && e && typeof e === "object") Object.assign(e, { errno: Number(m[1]) });
  return e;
}

/** The serverless driver with the decoders above. Tests use this too, so values match the app's. */
export const connectTiDb = (url: string) => connect({ url, decoders: DECODERS });

/**
 * Statements are formatted here (arrays become lists, nested arrays rows, dates UTC).
 * `serial`: one statement at a time, in call order. Needed inside a transaction: the driver
 * refuses a second statement on a transaction while one is running (mysql2 queued them itself).
 */
export function executor(runner: Runner, { serial = false } = {}): Executor {
  let queue: Promise<unknown> = Promise.resolve();
  const run = async <T>(sql: string, params: unknown[]) => {
    const statement = params.length ? format(sql, params as Parameters<typeof format>[1], true, "Z") : sql;
    try {
      const result = await runner.execute(statement);
      return (Array.isArray(result) ? result : []) as T[];
    } catch (e) {
      throw withErrno(e);
    }
  };
  return {
    query<T = Row>(sql: string, params: unknown[] = []) {
      if (!serial) return run<T>(sql, params);
      const next = queue.then(() => run<T>(sql, params));
      queue = next.catch(() => undefined); // a failed statement doesn't block the ones after it
      return next;
    },
  };
}

// deadlock, write conflict, schema changed during the transaction
const RETRYABLE = new Set([1213, 9007, 8028]);
const MAX_ATTEMPTS = 3;

/** The TiDB serverless (HTTPS) driver. `url` is DATABASE_URL: mysql://user:pass@host:4000/database */
export function createDatabase(url: string): Database {
  const database = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!database || SYSTEM_SCHEMAS.includes(database.toLowerCase())) {
    throw new Error("DATABASE_URL must name the application's own database, not a system schema.");
  }
  const client = connectTiDb(url);
  const direct = executor(client);
  return {
    async query<T = Row>(sql: string, params?: unknown[]) {
      try {
        return await direct.query<T>(sql, params);
      } catch (e) {
        throw translateError(e);
      }
    },
    async transaction(fn) {
      for (let attempt = 1; ; attempt++) {
        // TiDB Cloud runs pessimistic transactions: SELECT ... FOR UPDATE locks at once, as the rules need
        const tx = await client.begin();
        try {
          const out = await fn(executor(tx, { serial: true }));
          await tx.commit();
          return out;
        } catch (e) {
          await tx.rollback().catch(() => {});
          if (attempt < MAX_ATTEMPTS && RETRYABLE.has((withErrno(e) as { errno?: number } | null)?.errno ?? 0)) continue;
          throw translateError(e);
        }
      }
    },
  };
}
