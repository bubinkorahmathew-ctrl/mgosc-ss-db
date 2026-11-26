import type { NextRequest } from "next/server";
import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { getReceipt } from "@/lib/repo/accounting/receipts";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { renderReceipt } from "@/lib/pdf/accounts";
import { uuid } from "@/lib/validation/common";

/** GET /api/accounts/receipts/<id>/pdf[?download=1]: admins any receipt, teachers only ones they collected. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/accounts/receipts/[id]/pdf">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const id = uuid.safeParse((await ctx.params).id);
  if (!id.success) return textResponse(400, "Invalid link.");
  const r = await getReceipt(user, id.data);
  if (!r) return textResponse(404, "Receipt not found.");
  const buf = await renderReceipt(r, await getCurrency(user));
  return pdfResponse(buf, `${r.receiptNo} ${r.name}.pdf`, req.nextUrl.searchParams.has("download"));
}
