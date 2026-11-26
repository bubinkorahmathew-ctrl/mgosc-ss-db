import "server-only";
/**
 * Private files in Vercel Blob (signatures now; bills and other uploads later). Nothing here is
 * public: the store is private and files are only served by role-checked route handlers.
 * Callers in lib/repo check permissions first; these functions trust their arguments.
 */
import { del, get, put } from "@vercel/blob";

/** True when a Blob store is connected (BLOB_READ_WRITE_TOKEN). */
export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function putPrivateFile(pathname: string, data: Buffer, contentType: string): Promise<void> {
  await put(pathname, data, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
}

export async function readPrivateFile(pathname: string): Promise<{ data: Buffer; contentType: string } | null> {
  const found = await get(pathname, { access: "private" });
  if (!found) return null;
  const data = Buffer.from(await new Response(found.stream).arrayBuffer());
  return { data, contentType: found.blob.contentType ?? "application/octet-stream" };
}

export async function deletePrivateFile(pathname: string): Promise<void> {
  await del(pathname);
}
