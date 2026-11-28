"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, assertSuperAdmin } from "@/lib/auth";
import * as receipts from "@/lib/repo/accounting/receipts";
import * as payments from "@/lib/repo/accounting/payments";
import * as setup from "@/lib/repo/accounting/setup";
import { uuid } from "@/lib/validation/common";
import {
  categorySchema, charityGridSchema, currencySchema, eventSchema, openingBalanceSchema, paymentSchema, receiptSchema, voidSchema,
} from "@/lib/validation/accounts";
import { toActionError, type ActionResult } from "@/lib/action-result";

const ACCOUNT_PAGES = ["/admin/accounts", "/admin/accounts/receipts", "/admin/accounts/payments", "/admin/accounts/events",
  "/admin/accounts/cash-book", "/admin/accounts/charity", "/teacher/charity"];
const refresh = () => ACCOUNT_PAGES.forEach((p) => revalidatePath(p));

export async function createReceipt(input: unknown): Promise<ActionResult<{ id: string; receiptNo: string }>> {
  try {
    const user = await assertRole("admin");
    const saved = await receipts.createReceipt(user, receiptSchema.parse(input));
    refresh();
    return { ok: true, data: saved, message: `Receipt ${saved.receiptNo} saved.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function voidReceipt(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    const { id, reason } = voidSchema.parse(input);
    await receipts.voidReceipt(user, id, reason);
    refresh();
    return { ok: true, message: "Receipt voided. It stays in the books, marked void." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Charity grid: admins for any class, teachers for their own class and themselves. */
export async function saveCharity(input: unknown): Promise<ActionResult<{ saved: number; numbers: string[] }>> {
  try {
    const user = await assertRole("admin", "teacher");
    const saved = await receipts.saveCharityGrid(user, charityGridSchema.parse(input));
    refresh();
    const n = saved.length;
    return { ok: true, data: { saved: n, numbers: saved.map((s) => s.receiptNo) }, message: `${n} receipt${n === 1 ? "" : "s"} saved.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function savePayment(input: unknown): Promise<ActionResult<{ id: string; voucherNo: string }>> {
  try {
    const user = await assertRole("admin");
    const data = paymentSchema.parse(input);
    const saved = await payments.savePayment(user, data);
    refresh();
    return { ok: true, data: saved, message: data.id ? "Voucher updated." : `Voucher ${saved.voucherNo} saved as a draft.` };
  } catch (e) {
    return toActionError(e);
  }
}

const statusSchema = z.object({ id: uuid, action: z.enum(["approve", "pay", "void"]), reason: z.string().max(300).optional() });

export async function setPaymentStatus(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    const { id, action, reason } = statusSchema.parse(input);
    await payments.setPaymentStatus(user, id, action, reason?.trim());
    refresh();
    revalidatePath(`/admin/accounts/payments/${id}`);
    return { ok: true, message: action === "approve" ? "Voucher approved." : action === "pay" ? "Voucher marked paid." : "Voucher voided." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveEvent(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertRole("admin");
    const data = eventSchema.parse(input);
    const id = await setup.saveEvent(user, data);
    refresh();
    revalidatePath(`/admin/accounts/events/${id}`);
    return { ok: true, data: { id }, message: data.id ? "Event updated." : "Event created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveCategory(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    const data = categorySchema.parse(input);
    await setup.saveCategory(user, data);
    revalidatePath("/admin/accounts/settings");
    return { ok: true, message: data.id ? "Category saved." : "Category added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveOpeningBalance(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    await setup.saveOpeningBalance(user, openingBalanceSchema.parse(input));
    refresh();
    revalidatePath("/admin/accounts/settings");
    return { ok: true, message: "Opening balance saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveCurrency(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertSuperAdmin();
    await setup.saveCurrency(user, currencySchema.parse(input));
    refresh();
    revalidatePath("/admin/accounts/settings");
    return { ok: true, message: "Currency saved." };
  } catch (e) {
    return toActionError(e);
  }
}
