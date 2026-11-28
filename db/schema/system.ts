/** Sign-in, rate limits and stored images. Never reached by the app's data access, only by auth and file code. */
import { sql } from "drizzle-orm";
import { char, check, index, int, mysqlEnum, mysqlTable, primaryKey, uniqueIndex } from "drizzle-orm/mysql-core";
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

/**
 * "Forgot password" links. Only the SHA-256 of the emailed token is stored; a link works once,
 * for an hour. Older unused links of the same user are removed when a new one is made.
 */
export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: char("id", { length: 36 }).primaryKey(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  expiresAt: utc("expires_at").notNull(),
  usedAt: utc("used_at"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("password_reset_tokens_hash_key").on(t.tokenHash),
  index("password_reset_tokens_user_idx").on(t.userId, t.createdAt),
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

/**
 * Signature images when no Vercel Blob store is connected (local development). With Blob,
 * new uploads go there and this is only read as a fallback.
 */
export const brandingImages = mysqlTable("branding_images", {
  kind: mysqlEnum("kind", ["signature", "vicar_signature"]).primaryKey(),
  mime: mysqlEnum("mime", ["image/png", "image/jpeg"]).notNull(),
  data: mediumblob("data").notNull(),
  updatedAt: createdAt("updated_at"),
});
