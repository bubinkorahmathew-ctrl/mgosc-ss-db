import "server-only";
import type { SchoolSettingsRow } from "@/lib/db/types";
import type { NavStyle } from "@/components/layout/nav-config";
import { readNavStyle } from "@/lib/validation/menu-icons";
import type { z } from "zod";
import { AuthError } from "@/lib/auth";
import { NOT_ASSIGNED_PRAYER_UNIT } from "@/lib/config";
import { UserError } from "@/lib/user-error";
import type { settingsSchema } from "@/lib/validation/academics";
import type { navStyleSchema } from "@/lib/validation/menu-icons";
import { queryAs, requireRole, type Viewer } from "./access";

const FALLBACK: SchoolSettingsRow = {
  id: 1, school_name: "Sunday School", address: null, logo_url: null, headmaster_name: null, vicar_name: null,
  signature_url: null, vicar_signature_url: null, certificate_wording: {}, nav_icons: null, attendance_topper_min_pct: 50, timezone: "Asia/Riyadh", currency_code: "SAR", currency_symbol: "SAR", updated_at: new Date(0).toISOString(),
};

/** The super admin's menu icon choices (safe to apply to any menu). */
export async function getNavStyle(user: Viewer | null): Promise<NavStyle> {
  return readNavStyle((await getSettings(user)).nav_icons);
}

/** The single school_settings row (readable by any active staff member; visitors get the fallback). */
export async function getSettings(user: Viewer | null): Promise<SchoolSettingsRow> {
  const { data } = await queryAs(user).from("school_settings").select("*").eq("id", 1).maybeSingle();
  return data ?? FALLBACK;
}

function superAdmin(user: Viewer) {
  if (!requireRole(user, "admin").superAdmin) throw new AuthError("Only a super admin can do that.");
}

/** School details and certificate wording. Super admin only. */
export async function saveSettings(user: Viewer, input: z.output<typeof settingsSchema>): Promise<void> {
  superAdmin(user);
  const { certificate_wording, ...data } = input;
  const wording = Object.fromEntries(Object.entries(certificate_wording).map(([k, v]) => [k, v ?? ""]));
  const { error } = await queryAs(user).from("school_settings").update({ ...data, certificate_wording: wording }).eq("id", 1);
  if (error) throw error;
}

/** The icon and colour of each menu section and home-page tile. Super admin only. */
export async function saveMenuIcons(user: Viewer, style: z.output<typeof navStyleSchema>): Promise<void> {
  superAdmin(user);
  const { error } = await queryAs(user).from("school_settings")
    .update({ nav_icons: Object.keys(style).length ? style : null }).eq("id", 1);
  if (error) throw error;
}

/** Add a prayer unit, or rename / switch one on or off. "Not assigned" is fixed. Admins. */
export async function savePrayerUnit(user: Viewer, input: { id?: string; name: string; active: boolean }): Promise<void> {
  requireRole(user, "admin");
  const { id, name, active } = input;
  if (id === NOT_ASSIGNED_PRAYER_UNIT) throw new UserError("\"Not assigned\" cannot be changed.");
  const dbc = queryAs(user);
  if (id) {
    const { data, error } = await dbc.from("prayer_units").update({ name, active }).eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new UserError("Prayer unit not found.");
  } else {
    const { error } = await dbc.from("prayer_units").insert({ name, active });
    if (error) throw error;
  }
}

/** Only a unit no student or registration uses can be deleted; otherwise switch it off. */
export async function deletePrayerUnit(user: Viewer, id: string): Promise<void> {
  requireRole(user, "admin");
  if (id === NOT_ASSIGNED_PRAYER_UNIT) throw new UserError("\"Not assigned\" cannot be deleted.");
  const { data, error } = await queryAs(user).from("prayer_units").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") throw new UserError("Students or registrations use this unit. Switch it off instead.");
    throw error;
  }
  if (!data?.length) throw new UserError("Prayer unit not found.");
}