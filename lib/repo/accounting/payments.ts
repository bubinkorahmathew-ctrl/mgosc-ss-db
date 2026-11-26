import "server-only";
import type { z } from "zod";
import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { formatNumber, reserveNumbers } from "@/db/numbers";
import { profiles } from "@/db/schema";
import { accountCategories, events, payments } from "@/db/schema/accounts";
import { uuidv7 } from "@/lib/ids";
import { UserError } from "@/lib/user-error";
import type { paymentSchema } from "@/lib/validation/accounts";
import type { Viewer } from "../access";
import { blobEnabled, putPrivateFile, readPrivateFile } from "../files";
import { db, logAction, numberYear, requireAdmin } from "./shared";

/** A bill may be a photo or a PDF, up to 5 MB. */
export const MAX_BILL_BYTES = 5_000_000;
const BILL_TYPES = { "image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf" } as const;
export type BillType = keyof typeof BILL_TYPES;

/** By content, not by the name or type the browser claims. */
export function sniffBill(b: Buffer): BillType | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 4 && b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

/** Creates a draft voucher (numbered now), or edits a draft. Admins only. */
export async function savePayment(user: Viewer, input: z.output<typeof paymentSchema>): Promise<{ id: string; voucherNo: string }> {
  requireAdmin(user);
  return db().transaction(async (tx) => {
    const [c] = await tx.select().from(accountCategories).where(eq(accountCategories.id, input.category_id));
    if (!c || c.type !== "expense" || !c.active) throw new UserError("Choose a category from the list.", { category_id: ["Choose a category."] });
    if (input.event_id) {
      const [e] = await tx.select({ id: events.id }).from(events).where(eq(events.id, input.event_id));
      if (!e) throw new UserError("Choose an event from the list.");
    }
    const values = {
      paymentDate: input.payment_date, paidTo: input.paid_to, categoryId: input.category_id, eventId: input.event_id,
      amount: input.amount, paymentMode: input.payment_mode, referenceNo: input.reference_no, remarks: input.remarks,
      updatedBy: user.id, updatedAt: new Date(),
    };
    if (input.id) {
      const [p] = await tx.select({ status: payments.status, voucherNo: payments.voucherNo }).from(payments)
        .where(eq(payments.id, input.id)).for("update");
      if (!p) throw new UserError("Voucher not found.");
      if (p.status !== "draft") throw new UserError("Only a draft voucher can be changed. Void it and make a new one.");
      await tx.update(payments).set(values).where(eq(payments.id, input.id));
      return { id: input.id, voucherNo: p.voucherNo };
    }
    const year = numberYear(input.payment_date);
    const voucherNo = formatNumber("payment", year, await reserveNumbers(tx, "payment", year));
    const id = uuidv7();
    await tx.insert(payments).values({ ...values, id, voucherNo, requestedBy: user.id, createdBy: user.id });
    return { id, voucherNo };
  });
}

/** draft -> approved -> paid; any of them -> void (with a reason). Each step is logged. */
export async function setPaymentStatus(user: Viewer, id: string, action: "approve" | "pay" | "void", reason?: string) {
  requireAdmin(user);
  await db().transaction(async (tx) => {
    const [p] = await tx.select({ status: payments.status }).from(payments).where(eq(payments.id, id)).for("update");
    if (!p) throw new UserError("Voucher not found.");
    const now = new Date();
    if (action === "approve") {
      if (p.status !== "draft") throw new UserError("Only a draft voucher can be approved.");
      await tx.update(payments).set({ status: "approved", approvedBy: user.id, approvedAt: now, updatedBy: user.id, updatedAt: now }).where(eq(payments.id, id));
    } else if (action === "pay") {
      if (p.status !== "approved") throw new UserError("Approve the voucher before marking it paid.");
      await tx.update(payments).set({ status: "paid", paidAt: now, updatedBy: user.id, updatedAt: now }).where(eq(payments.id, id));
    } else {
      if (!reason?.trim()) throw new UserError("Give a reason for voiding.");
      if (p.status === "void") throw new UserError("This voucher is already void.");
      await tx.update(payments).set({ status: "void", voidReason: reason, updatedBy: user.id, updatedAt: now }).where(eq(payments.id, id));
    }
    await logAction(tx, "payment", id, action, user.id, action === "void" ? reason ?? null : null);
  });
}

/** Attaches (or replaces) the bill of a voucher that is not void. Stored privately in Vercel Blob. */
export async function attachBill(user: Viewer, id: string, data: Buffer) {
  requireAdmin(user);
  if (!blobEnabled()) throw new UserError("File storage is not connected yet (Vercel Blob). Ask the person who set up the app.");
  if (data.length > MAX_BILL_BYTES) throw new UserError("The bill must be smaller than 5 MB.");
  const type = sniffBill(data);
  if (!type) throw new UserError("The bill must be a photo (JPG or PNG) or a PDF.");
  const [p] = await db().select({ status: payments.status, voucherNo: payments.voucherNo }).from(payments).where(eq(payments.id, id));
  if (!p) throw new UserError("Voucher not found.");
  if (p.status === "void") throw new UserError("This voucher is void.");
  const path = `bills/${p.voucherNo}.${BILL_TYPES[type]}`;
  await putPrivateFile(path, data, type);
  await db().update(payments).set({ billPath: path, billType: type, updatedBy: user.id, updatedAt: new Date() }).where(eq(payments.id, id));
}

/** The bill file, for admins only. */
export async function readBill(user: Viewer, id: string) {
  requireAdmin(user);
  const [p] = await db().select({ path: payments.billPath, voucherNo: payments.voucherNo }).from(payments).where(eq(payments.id, id));
  if (!p?.path || !blobEnabled()) return null;
  const file = await readPrivateFile(p.path);
  return file ? { ...file, name: p.path.split("/").pop()! } : null;
}

export type PaymentFilters = { from?: string; to?: string; categoryId?: string; eventId?: string; status?: "draft" | "approved" | "paid" | "void" };

export async function listPayments(user: Viewer, f: PaymentFilters = {}, limit = 500) {
  requireAdmin(user);
  const where: SQL[] = [];
  if (f.from) where.push(gte(payments.paymentDate, f.from));
  if (f.to) where.push(lte(payments.paymentDate, f.to));
  if (f.categoryId) where.push(eq(payments.categoryId, f.categoryId));
  if (f.eventId) where.push(eq(payments.eventId, f.eventId));
  if (f.status) where.push(eq(payments.status, f.status));
  return db().select({
    id: payments.id, voucherNo: payments.voucherNo, paymentDate: payments.paymentDate, paidTo: payments.paidTo,
    amount: payments.amount, mode: payments.paymentMode, status: payments.status, voidReason: payments.voidReason,
    category: accountCategories.name, categoryId: payments.categoryId, event: events.name, eventId: payments.eventId,
    referenceNo: payments.referenceNo, remarks: payments.remarks, hasBill: payments.billPath,
  }).from(payments)
    .innerJoin(accountCategories, eq(accountCategories.id, payments.categoryId))
    .leftJoin(events, eq(events.id, payments.eventId))
    .where(and(...where))
    .orderBy(desc(payments.paymentDate), desc(payments.voucherNo))
    .limit(limit);
}

/** One voucher with who requested and approved it (voucher PDF, detail page). */
export async function getPayment(user: Viewer, id: string) {
  requireAdmin(user);
  const d = db();
  const [p] = await d.select().from(payments).where(eq(payments.id, id));
  if (!p) return null;
  const [[category], [event], people] = await Promise.all([
    d.select({ name: accountCategories.name }).from(accountCategories).where(eq(accountCategories.id, p.categoryId)),
    p.eventId ? d.select({ name: events.name }).from(events).where(eq(events.id, p.eventId)) : Promise.resolve([]),
    d.select({ id: profiles.id, name: profiles.fullName }).from(profiles)
      .where(inArray(profiles.id, [p.requestedBy, ...(p.approvedBy ? [p.approvedBy] : [])])),
  ]);
  const nameOf = (pid: string | null) => (pid ? people.find((x) => x.id === pid)?.name ?? null : null);
  return { ...p, category: category?.name ?? "", event: event?.name ?? null, requestedByName: nameOf(p.requestedBy), approvedByName: nameOf(p.approvedBy) };
}
