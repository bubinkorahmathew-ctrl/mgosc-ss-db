/**
 * In-process Postgres (PGlite) with minimal Supabase stubs so the real migration,
 * seed and RLS policies can be exercised without Docker or a hosted project.
 *
 * Stubs: roles anon/authenticated/service_role, auth.users, auth.identities,
 * auth.uid(), auth.jwt(), storage.buckets, storage.objects, Supabase default grants.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = path.resolve(__dirname, "..", "..");
const migrationsDir = path.join(root, "supabase", "migrations");

const SUPABASE_STUBS = /* sql */ `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text,
  banned_until timestamptz
);
create table auth.identities (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade,
  provider_id text, identity_data jsonb, provider text,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;

-- Supabase's default privileges on the public schema
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type TestDb = PGlite & {
  /** Run `fn` as an anonymous visitor (role anon). */
  asAnon<T>(fn: (db: PGlite) => Promise<T>): Promise<T>;
  /** Run `fn` as a signed-in user (role authenticated, auth.uid() = userId). */
  asUser<T>(userId: string, fn: (db: PGlite) => Promise<T>): Promise<T>;
};

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<TestDb> {
  const db = (await PGlite.create({ extensions: { pgcrypto } })) as unknown as TestDb;
  await db.exec(SUPABASE_STUBS);

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    }
  }
  if (opts.seed !== false) {
    try {
      await db.exec(fs.readFileSync(path.join(root, "supabase", "seed.sql"), "utf8"));
    } catch (e) {
      throw new Error(`seed.sql failed: ${(e as Error).message}`);
    }
  }

  const runAs = async <T>(role: string, sub: string | null, fn: (d: PGlite) => Promise<T>) => {
    await db.exec("begin");
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub ?? ""]);
      await db.exec(`set local role ${role}`);
      const out = await fn(db);
      await db.exec("commit");
      return out;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  };
  db.asAnon = (fn) => runAs("anon", null, fn);
  db.asUser = (userId, fn) => runAs("authenticated", userId, fn);
  return db;
}

export const IDS = {
  headmaster: "11111111-1111-1111-1111-111111111111",
  teacher1: "22222222-2222-2222-2222-222222222221", // Class 1
  teacher2: "22222222-2222-2222-2222-222222222222", // Class 2 + Class 3
  year: "aaaaaaaa-0000-0000-0000-000000002026",
  class1: "cccccccc-0000-0000-0000-000000000001",
  class2: "cccccccc-0000-0000-0000-000000000002",
  class3: "cccccccc-0000-0000-0000-000000000003",
  subjectOT: "5b000000-0000-0000-0000-000000000001",
  subjectMV: "5b000000-0000-0000-0000-000000000004",
  examC1: "e0000000-0000-0000-0000-000000000001",
  examC2: "e0000000-0000-0000-0000-000000000002",
  examC3: "e0000000-0000-0000-0000-000000000003",
  studentC1: "5d000000-0000-0000-0000-000000000001",
  studentC2: "5d000000-0000-0000-0000-000000000004",
  studentC3: "5d000000-0000-0000-0000-000000000007",
} as const;
