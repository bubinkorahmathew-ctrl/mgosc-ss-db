import "server-only";
import mysql, { type Pool, type PoolConnection } from "mysql2/promise";
import { translateError } from "./errors";
import type { Row } from "./values";

export interface Executor {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Executor {
  /** Everything inside runs in one transaction. `fn` may run again after a deadlock. */
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
}

export type TiDbConfig = { host: string; port: number; user: string; password: string; database: string };

const SYSTEM_SCHEMAS = ["sys", "mysql", "information_schema", "performance_schema", "metrics_schema"];

export function configFromEnv(env: Record<string, string | undefined> = process.env): TiDbConfig {
  const need = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
    return value;
  };
  return {
    host: need("TIDB_HOST"),
    port: Number(env.TIDB_PORT || 4000),
    user: need("TIDB_USER"),
    password: need("TIDB_PASSWORD"),
    database: need("TIDB_DATABASE"),
  };
}

export function createPool(config: TiDbConfig): Pool {
  if (SYSTEM_SCHEMAS.includes(config.database.toLowerCase())) {
    throw new Error("TIDB_DATABASE is a system schema; use the application's own database.");
  }
  const pool = mysql.createPool({
    ...config,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectTimeout: 15_000,
    connectionLimit: 10,
    maxIdle: 3,
    idleTimeout: 60_000, // TiDB Cloud drops idle connections after a few minutes
    enableKeepAlive: true,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: ["DATE"],
    decimalNumbers: true,
    stringifyObjects: true, // never expand an object into `key = value` SQL
    multipleStatements: false,
    disableEval: true,
  });
  // queued on the new connection before any caller's statement
  pool.on("connection", (connection) => {
    void connection.query("set time_zone = '+00:00'");
  });
  return pool;
}

export function executor(connection: Pool | PoolConnection | mysql.Connection): Executor {
  return {
    async query<T = Row>(sql: string, params: unknown[] = []) {
      const [result] = await connection.query(sql, params);
      return (Array.isArray(result) ? result : []) as T[];
    },
  };
}

// deadlock, write conflict, schema changed during the transaction
const RETRYABLE = new Set([1213, 9007, 8028]);
const MAX_ATTEMPTS = 3;

export function createDatabase(pool: Pool): Database {
  const direct = executor(pool);
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
        const connection = await pool.getConnection();
        let reusable = true;
        try {
          // Pessimistic is required: the rules rely on SELECT ... FOR UPDATE taking locks immediately.
          await connection.query("begin pessimistic");
          const out = await fn(executor(connection));
          await connection.query("commit");
          return out;
        } catch (e) {
          await connection.query("rollback").catch(() => {
            reusable = false;
          });
          if (attempt < MAX_ATTEMPTS && RETRYABLE.has((e as { errno?: number } | null)?.errno ?? 0)) continue;
          throw translateError(e);
        } finally {
          if (reusable) connection.release();
          else connection.destroy();
        }
      }
    },
  };
}
