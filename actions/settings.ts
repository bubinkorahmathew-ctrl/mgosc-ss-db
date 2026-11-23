"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { assertSuperAdmin } from "@/lib/auth";
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
