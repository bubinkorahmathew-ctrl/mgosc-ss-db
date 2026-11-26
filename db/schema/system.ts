/** Sign-in, rate limits and stored images. Never reached by the app's data access, only by auth and file code. */
import { sql } from "drizzle-orm";
import { bigint, char, check, index, int, mysqlEnum, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createdAt, mediumblob, utc } from "./columns";
import { users } from "./people";

/**
 * Failed sign-ins (and attempts in progress), keyed by HMACs of the email and of the device's
 * address, so neither is stored. Lockout rules: lib/authn/attempts.ts.
 */
export const loginAttempts = mysqlTable("login_attempts", {
  id: char("id", { length: 36 }).primaryKey(),
  accountKey: char("account_key", { length: 64 }).notNull(),
  deviceKey: char("device_key", { length: 64 }).notNull(),
  createdAt: utc("created_at").notNull(),
}, (t) => [
  index("login_attempts_pair_idx").on(t.accountKey, t.deviceKey, t.createdAt),
  index("login_attempts_account_idx").on(t.accountKey, t.createdAt),
  index("login_attempts_device_idx").on(t.deviceKey, t.createdAt),
  index("login_attempts_created_idx").on(t.createdAt),
]);

/** Old database sessions: unused since Auth.js (S2). Dropped in S4. */
export const sessions = mysqlTable("sessions", {
  tokenHash: char("token_hash", { length: 64 }).primaryKey(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: utc("expires_at").notNull(),
}, (t) => [
  index("sessions_user_idx").on(t.userId),
  index("sessions_expires_idx").on(t.expiresAt),
]);

/** Old sign-in throttle: replaced by login_attempts (S2). Dropped in S4. */
export const signInAttempts = mysqlTable("sign_in_attempts", {
  id: char("id", { length: 36 }).primaryKey(),
  accountKey: char("account_key", { length: 64 }).notNull(),
  ipKey: char("ip_key", { length: 64 }).notNull(),
  createdAt: utc("created_at").notNull(),
}, (t) => [
  index("sign_in_attempts_account_idx").on(t.accountKey, t.createdAt),
  index("sign_in_attempts_ip_idx").on(t.ipKey, t.createdAt),
  index("sign_in_attempts_created_idx").on(t.createdAt),
]);

/**
 * Fixed-window counters for public forms (registration, later OVBS and others): one row per
 * key and window. The key is an HMAC of the form name and the client address, never the address.
 */
export const rateLimits = mysqlTable("rate_limits", {
  key: char("key", { length: 64 }).notNull(),
  windowStart: utc("window_start").notNull(),
  count: int("count").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.key, t.windowStart] }),
  index("rate_limits_window_idx").on(t.windowStart),
  check("rate_limits_count_check", sql`${t.count} >= 0`),
]);

/** Old registration throttle: replaced by rate_limits (S3). Dropped in S4. */
export const registrationAttempts = mysqlTable("registration_attempts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  ipHash: varchar("ip_hash", { length: 128 }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("registration_attempts_ip_idx").on(t.ipHash, t.createdAt),
]);

/** Signature images (moving to Vercel Blob). */
export const brandingImages = mysqlTable("branding_images", {
  kind: mysqlEnum("kind", ["signature", "vicar_signature"]).primaryKey(),
  mime: mysqlEnum("mime", ["image/png", "image/jpeg"]).notNull(),
  data: mediumblob("data").notNull(),
  updatedAt: createdAt("updated_at"),
});
