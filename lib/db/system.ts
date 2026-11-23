import "server-only";
import type { AttemptStore } from "@/lib/rate-limit";
import type { Database } from "./connection";

/**
 * Work that has no user behind it and so bypasses the policies. Keep this file tiny: it replaces
 * the Supabase service-role client, and takes only values the server computed itself.
 */
export function registrationAttempts(database: Database): AttemptStore {
  return {
    async count(key, since) {
      const [row] = await database.query<{ n: number }>(
        "select count(*) as n from registration_attempts where ip_hash = ? and created_at >= ?", [key, since]);
      return Number(row.n);
    },
    async record(key) {
      await database.query("insert into registration_attempts (ip_hash, created_at) values (?, ?)", [key, new Date()]);
    },
    async purgeOlderThan(before) {
      await database.query("delete from registration_attempts where created_at < ?", [before]);
    },
  };
}
