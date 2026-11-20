import "server-only";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { loadBanner, loadBrandingImage } from "@/lib/pdf/images";

export function textResponse(status: number, message: string) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Signed-in, active staff only. Data access is then limited by RLS. */
export async function apiUser(): Promise<CurrentUser | Response> {
  const user = await getCurrentUser();
  return user ?? textResponse(401, "Please sign in again.");
}

export function pdfResponse(buf: Buffer, filename: string, download: boolean) {
  const safe = filename.replace(/[^\w.-]+/g, "_");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safe}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function getBranding() {
  const settings = await getSettings();
  const [banner, logo, signature] = await Promise.all([
    loadBanner(), loadBrandingImage(settings.logo_url), loadBrandingImage(settings.signature_url),
  ]);
  return { schoolName: settings.school_name, address: settings.address, headmasterName: settings.headmaster_name, banner, logo, signature };
}
