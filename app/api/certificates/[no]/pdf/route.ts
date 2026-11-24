import type { NextRequest } from "next/server";
import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { createClient } from "@/lib/db/server";
import { PDF_CERTIFICATE_COLUMNS } from "@/lib/data/certificates";
import { normaliseCertNo } from "@/lib/data/verify";
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

  const dbc = await createClient();
  const { data, error } = await dbc.from("certificates").select(PDF_CERTIFICATE_COLUMNS).eq("certificate_no", no).maybeSingle();
  if (error) return textResponse(500, "Could not load the certificate.");
  if (!data) return textResponse(404, "Certificate not found.");

  const buf = await renderCertificates([{ ...data, key: data.id }]);
  return pdfResponse(buf, `${data.certificate_no} ${data.student_name}.pdf`, req.nextUrl.searchParams.has("download"));
}
