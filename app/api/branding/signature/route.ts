import { revalidatePath } from "next/cache";
import { textResponse, apiUser } from "@/lib/api";
import { MAX_SIGNATURE_BYTES, parseSigner, readSignature, saveSignature, sniffImage } from "@/lib/branding";
import { getDatabase } from "@/lib/db";

/** Signed-in staff only: a signature is worth protecting. ?who=vicar for the Vicar's, else the Headmaster's. */
export async function GET(request: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const image = await readSignature(getDatabase(), parseSigner(new URL(request.url).searchParams.get("who")));
  if (!image) return textResponse(404, "No signature.");
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Super admin only. Route handlers, unlike server actions, have no built-in CSRF check. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !URL.canParse(origin) || new URL(origin).host !== host) return textResponse(403, "Wrong origin.");

  const user = await apiUser();
  if (user instanceof Response) return user;
  if (!user.superAdmin) return textResponse(403, "Only a super admin can do that.");

  const length = Number(request.headers.get("content-length"));
  if (!length || length > MAX_SIGNATURE_BYTES) return textResponse(413, "The image must be smaller than 1 MB.");
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length > MAX_SIGNATURE_BYTES) return textResponse(413, "The image must be smaller than 1 MB.");
  if (!sniffImage(data)) return textResponse(415, "Please choose a PNG or JPG image.");

  await saveSignature(getDatabase(), user.id, data, parseSigner(new URL(request.url).searchParams.get("who")));
  revalidatePath("/admin/settings");
  return textResponse(200, "Signature saved.");
}
