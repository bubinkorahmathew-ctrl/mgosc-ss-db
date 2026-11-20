"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth";
import { brandingImageSchema, settingsSchema } from "@/lib/validation/academics";
import { isBrandingUrl } from "@/lib/pdf/images";
import { toActionError, type ActionResult } from "@/lib/action-result";

export async function saveSettings(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { certificate_wording, ...data } = settingsSchema.parse(input);
    const wording = Object.fromEntries(Object.entries(certificate_wording).map(([k, v]) => [k, v ?? ""]));
    const supabase = await createClient();
    const { error } = await supabase.from("school_settings")
      .update({ ...data, certificate_wording: wording, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
    revalidatePath("/admin/settings");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Store (or clear) the public URL of an image the headmaster uploaded to the branding bucket. */
export async function saveBrandingImage(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { kind, url } = brandingImageSchema.parse(input);
    if (url !== null && !isBrandingUrl(url.split("?")[0])) return { ok: false, error: "Invalid image location." };
    const supabase = await createClient();
    const { error } = await supabase.from("school_settings")
      .update(kind === "logo" ? { logo_url: url } : { signature_url: url }).eq("id", 1);
    if (error) throw error;
    revalidatePath("/admin/settings");
    return { ok: true, message: url ? "Image saved." : "Image removed." };
  } catch (e) {
    return toActionError(e);
  }
}
