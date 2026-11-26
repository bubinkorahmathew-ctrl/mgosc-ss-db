/**
 * Column helpers shared by the schema files.
 *
 * Conventions (the database is TiDB Cloud, MySQL-compatible, utf8mb4 with the utf8mb4_bin
 * collation so Malayalam text and exact comparisons work everywhere):
 * - ids are CHAR(36). New rows get a UUID v7 from the app (lib/ids.ts); the column also keeps
 *   its database default, so rows written by plain SQL (migrations, scripts) get one too.
 * - DATETIME(3) values are UTC. Calendar dates (DATE) are plain YYYY-MM-DD strings.
 * - money is DECIMAL(12,2), marks and percentages DECIMAL(6,2) or (5,2): never FLOAT.
 * - booleans are TINYINT(1).
 */
import { sql } from "drizzle-orm";
import { char, customType, datetime } from "drizzle-orm/mysql-core";
import { uuidv7 } from "../../lib/ids"; // relative: drizzle-kit loads this file without the "@/" alias

/** CHAR(36) primary key: UUID v7 from the app, uuid() as the database default. */
export const id = () => char("id", { length: 36 }).primaryKey().default(sql`(uuid())`).$defaultFn(() => uuidv7());

/** CHAR(36) reference to another row's id. */
export const ref = (name: string) => char(name, { length: 36 });

/** DATETIME(3) in UTC, read as a Date. */
export const utc = (name: string) => datetime(name, { mode: "date", fsp: 3 });

/** DATETIME(3) set to the current time when the row is written. */
export const createdAt = (name = "created_at") => utc(name).notNull().default(sql`(current_timestamp(3))`);

/** MEDIUMBLOB (up to 16 MB), read as a Buffer. */
export const mediumblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "mediumblob",
});
