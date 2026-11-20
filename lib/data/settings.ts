import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SchoolSettingsRow } from "@/lib/supabase/types";

const FALLBACK: SchoolSettingsRow = {
  id: 1, school_name: "Sunday School", address: null, logo_url: null, headmaster_name: null,
  signature_url: null, certificate_wording: {}, updated_at: new Date(0).toISOString(),
};

/** The single school_settings row (readable by any signed-in user). */
export async function getSettings(): Promise<SchoolSettingsRow> {
  const supabase = await createClient();
  const { data } = await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle();
  return data ?? FALLBACK;
}
