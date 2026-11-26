import "server-only";
import { createDatabase, type Database } from "./connection";

let cached: Database | undefined;
let override: Database | undefined;

/**
 * The policy engine's database handle (TiDB serverless driver), created on first use so that a
 * build needs no database. It has no user and so no policies: only lib/repo uses it.
 */
export function getDatabase(): Database {
  if (override) return override;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  return (cached ??= createDatabase(url));
}

/** Tests only: point lib/repo at a throwaway test database (or back, with undefined). */
export function setTestDatabase(database: Database | undefined) {
  if (process.env.NODE_ENV === "production") throw new Error("not in production");
  override = database;
}
