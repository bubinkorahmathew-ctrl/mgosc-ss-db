import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role client. BYPASSES RLS. Server-only (the `server-only` import makes
 * the build fail if this module ever reaches a client bundle).
 * Use only after the caller's role has been verified, and only for:
 *  - Auth admin API (create/ban teachers, reset passwords)
 *  - registration rate-limit bookkeeping
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing environment variable SUPABASE_SECRET_KEY. See .env.example.");
  return createClient<Database>(publicEnv.supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
