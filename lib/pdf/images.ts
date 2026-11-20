import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { publicEnv } from "@/lib/env";

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

/** Public URL prefix of the branding bucket. Only these URLs are ever fetched (no SSRF). */
export function brandingPrefix() {
  return `${publicEnv.supabaseUrl().replace(/\/$/, "")}/storage/v1/object/public/branding/`;
}

export function isBrandingUrl(url: string) {
  return url.startsWith(brandingPrefix()) && !url.includes("..");
}

/** Fetch logo/signature bytes for react-pdf. Returns null on any problem (PDF still renders). */
export async function loadBrandingImage(url: string | null | undefined): Promise<PdfImage | null> {
  if (!url || !isBrandingUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const format = type.includes("png") ? "png" : /jpe?g/.test(type) ? "jpg" : null;
    if (!format) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2_000_000) return null;
    return { data: buf, format };
  } catch {
    return null;
  }
}
