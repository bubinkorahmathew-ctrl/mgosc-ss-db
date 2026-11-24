import "server-only";
import { createClient } from "@/lib/db/server";
import type { SchoolSettingsRow } from "@/lib/db/types";
import type { NavStyle } from "@/components/layout/nav-config";
import { readNavStyle } from "@/lib/validation/menu-icons";

const FALLBACK: SchoolSettingsRow = {
  id: 1, school_name: "Sunday School", address: null, logo_url: null, headmaster_name: null, vicar_name: null,
  signature_url: null, vicar_signature_url: null, certificate_wording: {}, nav_icons: null, updated_at: new Date(0).toISOString(),
};

/** The super admin's menu icon choices (safe to apply to any menu). */
export async function getNavStyle(): Promise<NavStyle> {
  return readNavStyle((await getSettings()).nav_icons);
}

/** The single school_settings row (readable by any signed-in user). */
export async function getSettings(): Promise<SchoolSettingsRow> {
  const dbc = await createClient();
  const { data } = await dbc.from("school_settings").select("*").eq("id", 1).maybeSingle();
  return data ?? FALLBACK;
}
