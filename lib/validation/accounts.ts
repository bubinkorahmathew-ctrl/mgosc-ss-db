import { z } from "zod";
import { todayISO } from "@/lib/dates";
import { fromCents, MAX_CENTS, toCents } from "@/lib/money";
import { isoDate, optionalText, requiredText, uuid } from "./common";

export const PAYMENT_MODES = ["cash", "bank", "online"] as const;
export const PAYMENT_MODE_LABELS: Record<(typeof PAYMENT_MODES)[number], string> = {
  cash: "Cash", bank: "Bank transfer", online: "Online",
};

/**
 * A money amount from a form ("500", "500.5", "1,250.00") -> the DECIMAL string "1250.00".
 * Exactly two decimals at most; never a float.
 */
export const amount = (label = "Amount") => z.union([z.string(), z.number()], { error: `${label} is required.` })
  .transform((v, ctx) => {
    const text = String(v).replace(/,/g, "").trim();
    try {
      const cents = toCents(text);
      if (cents <= 0) throw new Error("zero");
      if (cents > MAX_CENTS) throw new Error("too big");
      return fromCents(cents);
    } catch {
      ctx.addIssue({ code: "custom", message: `${label}: enter an amount above 0 with at most 2 decimals.` });
      return z.NEVER;
    }
  });

/** Zero allowed (opening balances, budgets). */
export const amountOrZero = (label: string) => z.union([z.string(), z.number()])
  .transform((v, ctx) => {
    const text = String(v).replace(/,/g, "").trim() || "0";
    try {
      const cents = toCents(text);
      if (cents > MAX_CENTS) throw new Error("too big");
      return fromCents(cents);
    } catch {
      ctx.addIssue({ code: "custom", message: `${label}: enter an amount with at most 2 decimals.` });
      return z.NEVER;
    }
  });

const notFuture = isoDate.refine((d) => d <= todayISO(), "The date cannot be in the future.");
const mode = z.enum(PAYMENT_MODES, { error: "Choose how it was paid." });
const optionalId = z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => v || null);

export const receiptSchema = z.object({
  receipt_date: notFuture,
  received_from_type: z.enum(["student", "teacher", "other"]),
  student_id: optionalId,
  teacher_id: optionalId,
  received_from_name: optionalText("Name", 120),
  category_id: uuid,
  event_id: optionalId,
  amount: amount(),
  payment_mode: mode,
  reference_no: optionalText("Reference number", 60),
  remarks: optionalText("Remarks", 300),
}).superRefine((v, ctx) => {
  if (v.received_from_type === "student" && !v.student_id) ctx.addIssue({ code: "custom", path: ["student_id"], message: "Choose the student." });
  if (v.received_from_type === "teacher" && !v.teacher_id) ctx.addIssue({ code: "custom", path: ["teacher_id"], message: "Choose the teacher." });
  if (v.received_from_type === "other" && !v.received_from_name) ctx.addIssue({ code: "custom", path: ["received_from_name"], message: "Enter who paid." });
});
export type ReceiptInput = z.input<typeof receiptSchema>;

/** The charity grid: one amount box per student and per teacher; blanks are skipped. */
export const charityGridSchema = z.object({
  receipt_date: notFuture,
  class_id: uuid,
  payment_mode: mode.default("cash"),
  students: z.array(z.object({ id: uuid, amount: z.string().max(20) })).max(300),
  teachers: z.array(z.object({ id: uuid, amount: z.string().max(20) })).max(50).default([]),
}).transform((v, ctx) => {
  const pick = (rows: { id: string; amount: string }[], path: string) => rows.flatMap((r, i) => {
    if (!r.amount.trim()) return [];
    const parsed = amount().safeParse(r.amount);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", path: [path, i, "amount"], message: parsed.error.issues[0].message });
      return [];
    }
    return [{ id: r.id, amount: parsed.data }];
  });
  return { ...v, students: pick(v.students, "students"), teachers: pick(v.teachers, "teachers") };
});

export const voidSchema = z.object({ id: uuid, reason: requiredText("Reason", 300) });

export const paymentSchema = z.object({
  id: uuid.optional(),
  payment_date: notFuture,
  paid_to: requiredText("Paid to", 120),
  category_id: uuid,
  event_id: optionalId,
  amount: amount(),
  payment_mode: mode,
  reference_no: optionalText("Reference number", 60),
  remarks: optionalText("Remarks", 300),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export const eventSchema = z.object({
  id: uuid.optional(),
  name: requiredText("Event name", 120),
  event_date: z.union([isoDate, z.literal(""), z.null()]).optional().transform((v) => v || null),
  budget: z.union([z.string(), z.number(), z.null()]).optional().transform((v, ctx) => {
    const text = v === null || v === undefined ? "" : String(v).replace(/,/g, "").trim();
    if (!text) return null;
    try {
      const cents = toCents(text);
      if (cents > MAX_CENTS) throw new Error("too big");
      return fromCents(cents);
    } catch {
      ctx.addIssue({ code: "custom", message: "Budget: enter an amount with at most 2 decimals." });
      return z.NEVER;
    }
  }),
  status: z.enum(["planned", "ongoing", "closed"]).default("planned"),
  notes: optionalText("Notes", 1000),
});

export const categorySchema = z.object({
  id: uuid.optional(),
  name: requiredText("Category name", 80),
  type: z.enum(["income", "expense"]),
  active: z.boolean().default(true),
});

export const openingBalanceSchema = z.object({
  as_on_date: isoDate,
  cash: amountOrZero("Cash in hand"),
  bank: amountOrZero("Bank balance"),
});

export const currencySchema = z.object({
  currency_code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter code like SAR."),
  currency_symbol: requiredText("Currency symbol", 8),
});

/** Period filters for lists, the cash book and reports (YYYY-MM-DD, from <= to). */
export const periodSchema = z.object({ from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, { message: "The start date must be before the end date.", path: ["to"] });
