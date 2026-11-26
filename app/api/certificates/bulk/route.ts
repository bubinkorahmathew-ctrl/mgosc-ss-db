import type { NextRequest } from "next/server";
import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { AuthError } from "@/lib/auth";
import { CERT_LABELS } from "@/lib/certificates";
import { classCertificates } from "@/lib/repo/certificates";
import { renderCertificates } from "@/lib/pdf/certificate";
import { uuid } from "@/lib/validation/common";
import { certificateTypeEnum } from "@/lib/validation/certificates";

/** Big enough for any class; keeps one request's rendering bounded. */
const MAX_BULK = 200;

/**
 * GET /api/certificates/bulk?class=<id>&type=<type>[&download=1] — every valid (not revoked)
 * certificate of that type for the class, one per page, by student name. Admins: any class;
 * teachers: their own classes only.
 */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const sp = req.nextUrl.searchParams;
  const classId = uuid.safeParse(sp.get("class"));
  const type = certificateTypeEnum.safeParse(sp.get("type"));
  if (!classId.success || !type.success) return textResponse(400, "Choose a class and a certificate type.");

  let data;
  try {
    data = await classCertificates(user, classId.data, type.data, MAX_BULK + 1);
  } catch (e) {
    if (e instanceof AuthError) return textResponse(403, e.message);
    throw e;
  }
  if (!data.length) return textResponse(404, `No ${CERT_LABELS[type.data].toLowerCase()} certificates for this class yet.`);
  if (data.length > MAX_BULK) return textResponse(413, `More than ${MAX_BULK} certificates. Please print them in smaller groups.`);

  const buf = await renderCertificates(user, data.map((c) => ({ ...c, key: c.id })));
  return pdfResponse(buf, `${CERT_LABELS[type.data]} certificates ${data[0].class_name} (${data.length}).pdf`, sp.has("download"));
}
