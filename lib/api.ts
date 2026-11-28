import "server-only";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/repo/settings";
import { loadBanner, loadBrandingImage } from "@/lib/pdf/images";
import { isAdmin } from "@/lib/permissions";

export function textResponse(status: number, message: string) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Signed-in, active school staff (admins and teachers) only. Data access is then limited by the policies. */
export async function apiUser(): Promise<CurrentUser | Response> {
  const user = await getCurrentUser();
  if (!user) return textResponse(401, "Please sign in again.");
  if (!isAdmin(user.profile.role) && user.profile.role !== "teacher") return textResponse(403, "Not allowed.");
  return user;
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

export async function getBranding(user: CurrentUser) {
  const settings = await getSettings(user);
  const [banner, logo, signature] = await Promise.all([
    loadBanner(), loadBrandingImage(user, settings.logo_url), loadBrandingImage(user, settings.signature_url),
  ]);
  return { schoolName: settings.school_name, address: settings.address, headmasterName: settings.headmaster_name, banner, logo, signature };
}
