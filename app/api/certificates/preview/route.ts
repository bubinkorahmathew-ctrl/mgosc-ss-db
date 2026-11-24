import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { prepareCertificates } from "@/lib/data/certificates";
import { renderCertificates } from "@/lib/pdf/certificate";
import { issueCertificatesSchema } from "@/lib/validation/certificates";

/** A preview shows at most this many students; the rest look the same. */
const PREVIEW_MAX = 3;

/**
 * POST /api/certificates/preview with the issue form as JSON -> the PDF as it will be issued,
 * without saving anything or using up a number. Admins only, as issuing is.
 */
export async function POST(request: Request) {
  // route handlers, unlike server actions, have no built-in CSRF check
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !URL.canParse(origin) || new URL(origin).host !== host) return textResponse(403, "Wrong origin.");

  const user = await apiUser();
  if (user instanceof Response) return user;
  if (user.profile.role !== "headmaster") return textResponse(403, "Only admins issue certificates.");

  const body = await request.json().catch(() => null);
  const parsed = issueCertificatesSchema.safeParse(body);
  if (!parsed.success) return textResponse(400, parsed.error.issues[0]?.message ?? "Please check the form.");

  const v = { ...parsed.data, student_ids: parsed.data.student_ids.slice(0, PREVIEW_MAX) };
  const prepared = await prepareCertificates(v);
  if (!prepared.ok) return textResponse(422, prepared.error);

  const buf = await renderCertificates(prepared.rows.map((r, i) => ({
    ...r, key: `preview-${i}`, certificate_no: `PREVIEW-${i + 1}`, revoked: false,
  })), { preview: true });
  return pdfResponse(buf, "Certificate preview.pdf", false);
}
