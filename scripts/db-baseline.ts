/**
 * One-off, for a database that was built before Drizzle (the original tidb/migrations files):
 * records db/migrations 0000 (tables) and 0001 (views and default rows) as already applied, so
 * `npm run db:migrate` only runs the newer ones. It never creates, changes or drops a table.
 *
 *   npm run db:baseline            shows what it would do
 *   npm run db:baseline -- --apply records the two migrations
 *
 * Refuses to run on an empty database (use `npm run db:migrate` there) or when migrations are
 * already recorded.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const BASELINE = ["0000_baseline", "0001_views_and_seed"];

async function main() {
  try { process.loadEnvFile(".env.local"); } catch { /* the environment may set DATABASE_URL */ }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Set DATABASE_URL in .env.local first.");
  const url = new URL(raw);
  const apply = process.argv.includes("--apply");

  const db = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 4000), user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
  try {
    const [tables] = await db.query<mysql.RowDataPacket[]>(
      "select table_name as t from information_schema.tables where table_schema = database()");
    const names = new Set(tables.map((r) => r.t as string));
    if (!names.has("students") || !names.has("school_settings")) {
      throw new Error("This database has no app tables yet: run `npm run db:migrate` instead.");
    }
    if (names.has("__drizzle_migrations")) {
      const [done] = await db.query<mysql.RowDataPacket[]>("select count(*) as n from `__drizzle_migrations`");
      if (Number(done[0].n) > 0) throw new Error("Migrations are already recorded here; nothing to do.");
    }

    const dir = path.join(process.cwd(), "db", "migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta", "_journal.json"), "utf8")) as { entries: { tag: string; when: number }[] };
    const rows = BASELINE.map((tag) => {
      const entry = journal.entries.find((e) => e.tag === tag);
      if (!entry) throw new Error(`${tag} is missing from the journal`);
      // the same hash drizzle's migrator stores: sha256 of the file's SQL
      const hash = createHash("sha256").update(fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8")).digest("hex");
      return { tag, hash, when: entry.when };
    });
    for (const r of rows) console.log(`${apply ? "recording" : "would record"} ${r.tag} as applied`);
    if (!apply) {
      console.log("Nothing changed. Run again with --apply.");
      return;
    }
    await db.query(
      // exactly as drizzle-orm's migrator creates it
      "create table if not exists `__drizzle_migrations` (id serial primary key, hash text not null, created_at bigint)");
    for (const r of rows) await db.query("insert into `__drizzle_migrations` (hash, created_at) values (?, ?)", [r.hash, r.when]);
    console.log("Done. Now run `npm run db:migrate` for the newer migrations.");
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
