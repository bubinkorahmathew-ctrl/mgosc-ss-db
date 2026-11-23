import type { NextRequest } from "next/server";
import { apiUser, getBranding, pdfResponse, textResponse } from "@/lib/api";
import { certificateIdsParam } from "@/lib/validation/certificates";
import { createClient } from "@/lib/db/server";
import { renderCertificates } from "@/lib/pdf/certificate";

/** GET /api/pdf/certificates?ids=<id>,<id>...[&download=1] — always rendered from the stored snapshot. */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (user instanceof Response) return user;

  const ids = certificateIdsParam.safeParse(req.nextUrl.searchParams.get("ids") ?? "");
  if (!ids.success) return textResponse(400, "Invalid link.");

  const dbc = await createClient();
  const { data, error } = await dbc.from("certificates")
    .select("id, certificate_no, title, body_text, student_name, student_name_ml, class_teacher_name, issued_on, revoked")
    .in("id", ids.data);
  if (error) return textResponse(500, "Could not load certificates.");
  // RLS hides certificates of other classes; refuse partial batches rather than silently dropping
  if (!data?.length || data.length !== new Set(ids.data).size) return textResponse(404, "Certificate not found.");

  const order = new Map(ids.data.map((id, i) => [id, i]));
  data.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const buf = await renderCertificates(data, await getBranding());
  const name = data.length === 1 ? `${data[0].certificate_no} ${data[0].student_name}.pdf` : `Certificates (${data.length}).pdf`;
  return pdfResponse(buf, name, req.nextUrl.searchParams.has("download"));
}
