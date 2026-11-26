"use server";

import { revalidatePath } from "next/cache";
import { assertRole, assertSuperAdmin } from "@/lib/auth";
import { parseSigner } from "@/lib/branding";
import { removeSignature } from "@/lib/repo/branding";
import * as settings from "@/lib/repo/settings";
import { deletePrayerUnitSchema, prayerUnitSchema } from "@/lib/validation/prayer-units";
import { settingsSchema } from "@/lib/validation/academics";
import { navStyleSchema } from "@/lib/validation/menu-icons";
import { toActionError, type ActionResult } from "@/lib/action-result";

export async function saveSettings(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertSuperAdmin();
    await settings.saveSettings(user, settingsSchema.parse(input));
    revalidatePath("/admin/settings");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return toActionError(e);
  }
}

/** The icon and colour of each menu section and home-page tile. */
export async function saveMenuIcons(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertSuperAdmin();
    await settings.saveMenuIcons(user, navStyleSchema.parse(input));
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
    const user = await assertRole("headmaster");
    const data = prayerUnitSchema.parse(input);
    await settings.savePrayerUnit(user, data);
    for (const path of PRAYER_UNIT_PAGES) revalidatePath(path);
    return { ok: true, message: data.id ? "Prayer unit saved." : "Prayer unit added." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Only a unit no student or registration uses can be deleted; otherwise switch it off. */
export async function deletePrayerUnit(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    await settings.deletePrayerUnit(user, deletePrayerUnitSchema.parse(input).id);
    for (const path of PRAYER_UNIT_PAGES) revalidatePath(path);
    return { ok: true, message: "Prayer unit deleted." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Uploads go to app/api/branding/signature. This clears the Headmaster's or the Vicar's. */
export async function removeSignatureImage(who?: unknown): Promise<ActionResult> {
  try {
    const user = await assertSuperAdmin();
    await removeSignature(user, parseSigner(typeof who === "string" ? who : null));
    revalidatePath("/admin/settings");
    return { ok: true, message: "Signature removed." };
  } catch (e) {
    return toActionError(e);
  }
}
