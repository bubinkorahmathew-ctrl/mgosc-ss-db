import { revalidatePath } from "next/cache";
import { apiUser, textResponse } from "@/lib/api";
import { attachBill, MAX_BILL_BYTES, readBill } from "@/lib/repo/accounting/payments";
import { uuid } from "@/lib/validation/common";
import { UserError } from "@/lib/user-error";

/** GET: the bill of a voucher (photo or PDF), for admins only. Never cached publicly. */
export async function GET(_req: Request, ctx: RouteContext<"/api/accounts/payments/[id]/bill">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  if (user.profile.role !== "headmaster") return textResponse(403, "Not allowed.");
  const id = uuid.safeParse((await ctx.params).id);
  if (!id.success) return textResponse(400, "Invalid link.");
  const file = await readBill(user, id.data);
  if (!file) return textResponse(404, "No bill attached.");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${file.name}"`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** POST the file as the request body. Admins only. Route handlers have no built-in CSRF check. */
export async function POST(request: Request, ctx: RouteContext<"/api/accounts/payments/[id]/bill">) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !URL.canParse(origin) || new URL(origin).host !== host) return textResponse(403, "Wrong origin.");

  const user = await apiUser();
  if (user instanceof Response) return user;
  if (user.profile.role !== "headmaster") return textResponse(403, "Not allowed.");
  const id = uuid.safeParse((await ctx.params).id);
  if (!id.success) return textResponse(400, "Invalid link.");

  const length = Number(request.headers.get("content-length"));
  if (!length || length > MAX_BILL_BYTES) return textResponse(413, "The bill must be smaller than 5 MB.");
  const data = Buffer.from(await request.arrayBuffer());
  try {
    await attachBill(user, id.data, data);
  } catch (e) {
    if (e instanceof UserError) return textResponse(422, e.message);
    throw e;
  }
  revalidatePath(`/admin/accounts/payments/${id.data}`);
  revalidatePath("/admin/accounts/payments");
  return textResponse(200, "Bill attached.");
}
