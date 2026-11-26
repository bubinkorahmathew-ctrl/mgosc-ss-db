import "server-only";
/**
 * The Headmaster's and the Vicar's signature images. Stored privately in Vercel Blob; until a
 * Blob store is connected (no BLOB_READ_WRITE_TOKEN, e.g. local development) they stay in the
 * database table branding_images, as before.
 */
import { AuthError } from "@/lib/auth";
import { MAX_SIGNATURE_BYTES, SIGNATURE_PATH, sniffImage, type ImageMime, type Signer } from "@/lib/branding";
import { getDatabase } from "@/lib/db";
import { UserError } from "@/lib/user-error";
import { queryAs, requireRole, type Viewer } from "./access";
import { blobEnabled, deletePrivateFile, putPrivateFile, readPrivateFile } from "./files";

const KIND: Record<Signer, "signature" | "vicar_signature"> = { headmaster: "signature", vicar: "vicar_signature" };
const COLUMN: Record<Signer, "signature_url" | "vicar_signature_url"> = { headmaster: "signature_url", vicar: "vicar_signature_url" };
/** Fixed names in the private store: one file per signer, replaced on upload. */
export const blobPath = (signer: Signer) => `branding/${KIND[signer]}`;

function superAdmin(user: Viewer) {
  if (!requireRole(user, "headmaster").superAdmin) throw new AuthError("Only a super admin can do that.");
}

/** Saves the image and points the settings at it. Super admin only. Returns the new URL. */
export async function saveSignature(user: Viewer, data: Buffer, signer: Signer = "headmaster"): Promise<string> {
  superAdmin(user);
  const mime = sniffImage(data);
  if (!mime) throw new UserError("The signature must be a PNG or JPG image.");
  if (data.length > MAX_SIGNATURE_BYTES) throw new UserError("The signature must be smaller than 1 MB.");
  const now = new Date();
  const url = `${SIGNATURE_PATH}?${signer === "vicar" ? "who=vicar&" : ""}v=${now.getTime()}`;

  if (blobEnabled()) await putPrivateFile(blobPath(signer), data, mime);
  else {
    await getDatabase().query(
      "insert into branding_images (kind, mime, data, updated_at) values (?, ?, ?, ?) on duplicate key update mime = values(mime), data = values(data), updated_at = values(updated_at)",
      [KIND[signer], mime, data, now]);
  }
  // the policies allow this update to a super admin only
  const { error } = await queryAs(user).from("school_settings").update({ [COLUMN[signer]]: url }).eq("id", 1);
  if (error) throw error;
  return url;
}

export async function removeSignature(user: Viewer, signer: Signer = "headmaster"): Promise<void> {
  superAdmin(user);
  const { error } = await queryAs(user).from("school_settings").update({ [COLUMN[signer]]: null }).eq("id", 1);
  if (error) throw error;
  if (blobEnabled()) await deletePrivateFile(blobPath(signer));
  await getDatabase().query("delete from branding_images where kind = ?", [KIND[signer]]);
}

/** For signed-in staff only (the signature is worth protecting): pages, previews and PDFs. */
export async function readSignature(user: Viewer, signer: Signer = "headmaster"): Promise<{ mime: ImageMime; data: Buffer } | null> {
  requireRole(user, "headmaster", "teacher");
  if (blobEnabled()) {
    const file = await readPrivateFile(blobPath(signer));
    if (file) return { mime: file.contentType === "image/png" ? "image/png" : "image/jpeg", data: file.data };
  }
  const [row] = await getDatabase().query<{ mime: ImageMime; data: Buffer }>(
    "select mime, data from branding_images where kind = ?", [KIND[signer]]);
  return row ?? null;
}
