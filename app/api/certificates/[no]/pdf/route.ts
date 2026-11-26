import type { NextRequest } from "next/server";
import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { certificateByNumber } from "@/lib/repo/certificates";
import { normaliseCertNo } from "@/lib/repo/verify";
import { renderCertificates } from "@/lib/pdf/certificate";

/**
 * GET /api/certificates/CERT-2026-0001/pdf[?download=1] — one issued certificate, inline.
 * The policies decide who may see it: admins any, teachers their own classes'.
 * (Node runtime is the default; Cache Components forbids the `runtime` export.)
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/certificates/[no]/pdf">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const no = normaliseCertNo((await ctx.params).no);
  if (!no) return textResponse(400, "Invalid certificate number.");

  const data = await certificateByNumber(user, no);
  if (!data) return textResponse(404, "Certificate not found.");

  const buf = await renderCertificates(user, [{ ...data, key: data.id }]);
  return pdfResponse(buf, `${data.certificate_no} ${data.student_name}.pdf`, req.nextUrl.searchParams.has("download"));
}
