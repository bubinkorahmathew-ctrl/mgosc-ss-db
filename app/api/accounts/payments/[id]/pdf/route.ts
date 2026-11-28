import type { NextRequest } from "next/server";
import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { getPayment } from "@/lib/repo/accounting/payments";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { renderVoucher } from "@/lib/pdf/accounts";
import { uuid } from "@/lib/validation/common";
import { isAdmin } from "@/lib/permissions";

/** GET /api/accounts/payments/<id>/pdf[?download=1]: the payment voucher. Admins only. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/accounts/payments/[id]/pdf">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  if (!isAdmin(user.profile.role)) return textResponse(403, "Not allowed.");
  const id = uuid.safeParse((await ctx.params).id);
  if (!id.success) return textResponse(400, "Invalid link.");
  const p = await getPayment(user, id.data);
  if (!p) return textResponse(404, "Voucher not found.");
  const buf = await renderVoucher(p, await getCurrency(user));
  return pdfResponse(buf, `${p.voucherNo} ${p.paidTo}.pdf`, req.nextUrl.searchParams.has("download"));
}
