import "server-only";
import { connect } from "@tidbcloud/serverless";
import { drizzle } from "drizzle-orm/tidb-serverless";
import * as schema from "./schema";

/** Drizzle on the TiDB serverless (HTTPS) driver. */
export function createDrizzle(url: string) {
  return drizzle({ client: connect({ url }), schema });
}

export type Db = ReturnType<typeof createDrizzle>;

let cached: Db | undefined;
let override: Db | undefined;

/** The app's Drizzle client (DATABASE_URL). Only lib/repo, lib/authn and scripts use it. */
export function getDb(): Db {
  if (override) return override;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (cached ??= createDrizzle(url));
}

/** Tests only: point getDb() at a throwaway test database. */
export function setTestDrizzle(db: Db | undefined) {
  if (process.env.NODE_ENV === "production") throw new Error("not in production");
  override = db;
}
