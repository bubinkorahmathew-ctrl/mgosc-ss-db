import "server-only";
import { configFromEnv, createDatabase, createPool, type Database } from "./connection";

const globals = globalThis as unknown as { smsDatabase?: Database };

/**
 * The process's connection pool, created on first use so that a build needs no database.
 * It has no user and so no policies: pages and actions use getUserDb() from lib/auth instead.
 */
export function getDatabase(): Database {
  return (globals.smsDatabase ??= createDatabase(createPool(configFromEnv())));
}
