import type { NextRequest } from "next/server";
import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { certificateIdsParam } from "@/lib/validation/certificates";
import { certificatesByIds } from "@/lib/repo/certificates";
import { renderCertificates } from "@/lib/pdf/certificate";

/**
 * GET /api/pdf/certificates?ids=<id>,<id>...[&download=1] — the certificates the app just
 * issued or listed, in the certificate design, always from the stored snapshot.
 */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (user instanceof Response) return user;

  const ids = certificateIdsParam.safeParse(req.nextUrl.searchParams.get("ids") ?? "");
  if (!ids.success) return textResponse(400, "Invalid link.");

  // the policies hide certificates of other classes; a partial batch is refused, not silently shortened
  const data = await certificatesByIds(user, ids.data);
  if (!data) return textResponse(404, "Certificate not found.");
  const buf = await renderCertificates(user, data.map((c) => ({ ...c, key: c.id })));
  const name = data.length === 1 ? `${data[0].certificate_no} ${data[0].student_name}.pdf` : `Certificates (${data.length}).pdf`;
  return pdfResponse(buf, name, req.nextUrl.searchParams.has("download"));
}
