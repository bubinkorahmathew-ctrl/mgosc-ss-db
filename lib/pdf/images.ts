import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { CurrentUser } from "@/lib/auth";
import { SIGNATURE_PATH, type Signer } from "@/lib/branding";
import { readSignature } from "@/lib/repo/branding";

export type PdfImage = { data: Buffer; format: "png" | "jpg" };

let banner: Promise<PdfImage | null> | undefined;

/** The church banner (assets/brand/banner.jpg) used as the header of report cards and certificates. */
export function loadBanner(): Promise<PdfImage | null> {
  banner ??= fs.readFile(path.join(process.cwd(), "assets", "brand", "banner.jpg"))
    .then((data): PdfImage => ({ data, format: "jpg" }))
    .catch(() => null);
  return banner;
}
/** Width / height of the banner, for layout. */
export const BANNER_RATIO = 4010 / 1056;

/** Signature bytes for react-pdf, straight from storage: nothing is fetched by a stored URL (no SSRF). */
export async function loadBrandingImage(
  user: CurrentUser, url: string | null | undefined, signer: Signer = "headmaster",
): Promise<PdfImage | null> {
  if (url?.split("?")[0] !== SIGNATURE_PATH) return null;
  try {
    const image = await readSignature(user, signer);
    return image ? { data: image.data, format: image.mime === "image/png" ? "png" : "jpg" } : null;
  } catch {
    return null; // the PDF still renders
  }
}
