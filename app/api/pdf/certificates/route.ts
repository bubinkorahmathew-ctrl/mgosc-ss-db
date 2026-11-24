import type { NextRequest } from "next/server";
import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { certificateIdsParam } from "@/lib/validation/certificates";
import { createClient } from "@/lib/db/server";
import { PDF_CERTIFICATE_COLUMNS } from "@/lib/data/certificates";
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

  const dbc = await createClient();
  const { data, error } = await dbc.from("certificates").select(PDF_CERTIFICATE_COLUMNS).in("id", ids.data);
  if (error) return textResponse(500, "Could not load certificates.");
  // the policies hide certificates of other classes; refuse partial batches rather than silently dropping
  if (!data?.length || data.length !== new Set(ids.data).size) return textResponse(404, "Certificate not found.");

  const order = new Map(ids.data.map((id, i) => [id, i]));
  data.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const buf = await renderCertificates(data.map((c) => ({ ...c, key: c.id })));
  const name = data.length === 1 ? `${data[0].certificate_no} ${data[0].student_name}.pdf` : `Certificates (${data.length}).pdf`;
  return pdfResponse(buf, name, req.nextUrl.searchParams.has("download"));
}
