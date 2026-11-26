/** Signature images: shared rules (no storage here; that is lib/repo/branding.ts). */
export const SIGNATURE_PATH = "/api/branding/signature";
export const MAX_SIGNATURE_BYTES = 1_000_000;

/** Whose signature: the Headmaster's is the original one (school_settings.signature_url). */
export type Signer = "headmaster" | "vicar";

export const parseSigner = (v: string | null | undefined): Signer => (v === "vicar" ? "vicar" : "headmaster");

export type ImageMime = "image/png" | "image/jpeg";

/** By content, not by the name or type the browser claims. */
export function sniffImage(b: Buffer): ImageMime | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}
