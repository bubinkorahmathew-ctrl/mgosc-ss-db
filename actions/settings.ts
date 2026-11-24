"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { assertRole, assertSuperAdmin } from "@/lib/auth";
import { NOT_ASSIGNED_PRAYER_UNIT } from "@/lib/config";
import { deletePrayerUnitSchema, prayerUnitSchema } from "@/lib/validation/prayer-units";
import { removeSignature } from "@/lib/branding";
import { getDatabase } from "@/lib/db";
import { settingsSchema } from "@/lib/validation/academics";
import { navStyleSchema } from "@/lib/validation/menu-icons";
import { toActionError, type ActionResult } from "@/lib/action-result";

export async function saveSettings(input: unknown): Promise<ActionResult> {
  try {
    await assertSuperAdmin();
    const { certificate_wording, ...data } = settingsSchema.parse(input);
    const wording = Object.fromEntries(Object.entries(certificate_wording).map(([k, v]) => [k, v ?? ""]));
    const dbc = await createClient();
    const { error } = await dbc.from("school_settings")
      .update({ ...data, certificate_wording: wording, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
    revalidatePath("/admin/settings");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return toActionError(e);
  }
}

/** The icon and colour of each menu section and home-page tile. */
export async function saveMenuIcons(input: unknown): Promise<ActionResult> {
  try {
    await assertSuperAdmin();
    const style = navStyleSchema.parse(input);
    const dbc = await createClient();
    const { error } = await dbc.from("school_settings")
      .update({ nav_icons: Object.keys(style).length ? style : null, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
    revalidatePath("/admin", "layout");
    revalidatePath("/teacher", "layout");
    return { ok: true, message: "Menu icons saved." };
  } catch (e) {
    return toActionError(e);
  }
}

const PRAYER_UNIT_PAGES = ["/admin/settings", "/register", "/admin/students", "/teacher/students"];

/** Add a prayer unit, or rename / switch one on or off. "Not assigned" is fixed. */
export async function savePrayerUnit(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id, name, active } = prayerUnitSchema.parse(input);
    if (id === NOT_ASSIGNED_PRAYER_UNIT) return { ok: false, error: "\"Not assigned\" cannot be changed." };
    const dbc = await createClient();
    if (id) {
      const { data, error } = await dbc.from("prayer_units").update({ name, active }).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) return { ok: false, error: "Prayer unit not found." };
    } else {
      const { error } = await dbc.from("prayer_units").insert({ name, active });
      if (error) throw error;
    }
    for (const path of PRAYER_UNIT_PAGES) revalidatePath(path);
    return { ok: true, message: id ? "Prayer unit saved." : "Prayer unit added." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Only a unit no student or registration uses can be deleted; otherwise switch it off. */
export async function deletePrayerUnit(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id } = deletePrayerUnitSchema.parse(input);
    if (id === NOT_ASSIGNED_PRAYER_UNIT) return { ok: false, error: "\"Not assigned\" cannot be deleted." };
    const dbc = await createClient();
    const { data, error } = await dbc.from("prayer_units").delete().eq("id", id).select("id");
    if (error) {
      if (error.code === "23503") return { ok: false, error: "Students or registrations use this unit. Switch it off instead." };
      throw error;
    }
    if (!data?.length) return { ok: false, error: "Prayer unit not found." };
    for (const path of PRAYER_UNIT_PAGES) revalidatePath(path);
    return { ok: true, message: "Prayer unit deleted." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Uploads go to app/api/branding/signature. This clears it. */
export async function removeSignatureImage(): Promise<ActionResult> {
  try {
    const user = await assertSuperAdmin();
    await removeSignature(getDatabase(), user.id);
    revalidatePath("/admin/settings");
    return { ok: true, message: "Signature removed." };
  } catch (e) {
    return toActionError(e);
  }
}
