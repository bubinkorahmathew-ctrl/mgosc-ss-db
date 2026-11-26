/**
 * drizzle-kit: `npm run db:generate` writes a migration from db/schema, `npm run db:migrate`
 * applies the pending ones to the database in DATABASE_URL (.env.local, never committed).
 */
import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI and Vercel set DATABASE_URL in the environment instead
}

function credentials() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Set DATABASE_URL (mysql://user:password@host:4000/database) in .env.local");
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
  };
}

export default defineConfig({
  dialect: "mysql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: credentials(),
  strict: true,
  verbose: true,
});
