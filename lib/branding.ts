import "server-only";
import type { Database, Executor } from "@/lib/db/connection";
import { notAllowed, violates } from "@/lib/db/errors";
import { lockActor } from "@/lib/db/policies";

export const SIGNATURE_PATH = "/api/branding/signature";
export const MAX_SIGNATURE_BYTES = 1_000_000;

type Mime = "image/png" | "image/jpeg";

/** By content, not by the name or type the browser claims. */
export function sniffImage(b: Buffer): Mime | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

async function requireSuper(tx: Executor, userId: string) {
  if (!(await lockActor(tx, userId)).superAdmin) throw notAllowed();
}

export async function saveSignature(database: Database, userId: string, data: Buffer): Promise<string> {
  const mime = sniffImage(data);
  if (!mime) throw violates("the signature must be a PNG or JPG image");
  if (data.length > MAX_SIGNATURE_BYTES) throw violates("the signature must be smaller than 1 MB");
  const now = new Date();
  const url = `${SIGNATURE_PATH}?v=${now.getTime()}`;
  await database.transaction(async (tx) => {
    await requireSuper(tx, userId);
    await tx.query(
      "insert into branding_images (kind, mime, data, updated_at) values ('signature', ?, ?, ?) on duplicate key update mime = values(mime), data = values(data), updated_at = values(updated_at)",
      [mime, data, now]);
    await tx.query("update school_settings set signature_url = ?, updated_at = ? where id = 1", [url, now]);
  });
  return url;
}

export async function removeSignature(database: Database, userId: string): Promise<void> {
  await database.transaction(async (tx) => {
    await requireSuper(tx, userId);
    await tx.query("delete from branding_images where kind = 'signature'");
    await tx.query("update school_settings set signature_url = null, updated_at = ? where id = 1", [new Date()]);
  });
}

/** Callers must have checked that a staff member is signed in. */
export async function readSignature(database: Executor): Promise<{ mime: Mime; data: Buffer } | null> {
  const [row] = await database.query<{ mime: Mime; data: Buffer }>("select mime, data from branding_images where kind = 'signature'");
  return row ?? null;
}
