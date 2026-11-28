import "server-only";
import type { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { schoolSettings } from "@/db/schema";
import { accountCategories, events, openingBalances, payments, receipts } from "@/db/schema/accounts";
import { AuthError } from "@/lib/auth";
import { uuidv7 } from "@/lib/ids";
import { UserError } from "@/lib/user-error";
import type { categorySchema, currencySchema, eventSchema, openingBalanceSchema } from "@/lib/validation/accounts";
import { requireRole, type Viewer } from "../access";
import { db, requireAdmin } from "./shared";

const isDuplicate = (e: unknown) => /duplicate entry|1062/i.test(String((e as { cause?: { message?: string } })?.cause?.message ?? (e as Error)?.message));

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** For pickers: active categories (admins may ask for switched-off ones too). */
export async function listCategories(user: Viewer, opts: { type?: "income" | "expense"; all?: boolean } = {}) {
  requireRole(user, "admin", "teacher");
  if (opts.all) requireAdmin(user);
  return db().select({ id: accountCategories.id, name: accountCategories.name, type: accountCategories.type, active: accountCategories.active })
    .from(accountCategories)
    .where(and(...(opts.type ? [eq(accountCategories.type, opts.type)] : []), ...(opts.all ? [] : [eq(accountCategories.active, true)])))
    .orderBy(asc(accountCategories.type), asc(accountCategories.name));
}

/** Add or rename / switch off a category. A used category is never deleted. */
export async function saveCategory(user: Viewer, input: z.output<typeof categorySchema>) {
  requireAdmin(user);
  try {
    if (input.id) {
      const [c] = await db().select({ type: accountCategories.type }).from(accountCategories).where(eq(accountCategories.id, input.id));
      if (!c) throw new UserError("Category not found.");
      if (c.type !== input.type) throw new UserError("A category can't change between income and expense.");
      await db().update(accountCategories).set({ name: input.name, active: input.active, updatedBy: user.id, updatedAt: new Date() })
        .where(eq(accountCategories.id, input.id));
    } else {
      await db().insert(accountCategories).values({ name: input.name, type: input.type, active: input.active, createdBy: user.id, updatedBy: user.id });
    }
  } catch (e) {
    if (isDuplicate(e)) throw new UserError("A category with that name already exists.", { name: ["Already exists."] });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function listEvents(user: Viewer) {
  requireAdmin(user);
  const d = db();
  const [list, income, expense] = await Promise.all([
    d.select().from(events).orderBy(desc(events.eventDate), asc(events.name)),
    d.select({ eventId: receipts.eventId, total: sql<string>`sum(${receipts.amount})` }).from(receipts)
      .where(and(eq(receipts.status, "active"), sql`${receipts.eventId} is not null`)).groupBy(receipts.eventId),
    d.select({ eventId: payments.eventId, total: sql<string>`sum(${payments.amount})` }).from(payments)
      .where(and(eq(payments.status, "paid"), sql`${payments.eventId} is not null`)).groupBy(payments.eventId),
  ]);
  const inc = new Map(income.map((r) => [r.eventId, r.total]));
  const exp = new Map(expense.map((r) => [r.eventId, r.total]));
  return list.map((e) => ({ ...e, income: inc.get(e.id) ?? "0.00", expense: exp.get(e.id) ?? "0.00" }));
}

export async function getEvent(user: Viewer, id: string) {
  requireAdmin(user);
  const [e] = await db().select().from(events).where(eq(events.id, id));
  return e ?? null;
}

export async function saveEvent(user: Viewer, input: z.output<typeof eventSchema>): Promise<string> {
  requireAdmin(user);
  const values = { name: input.name, eventDate: input.event_date, budget: input.budget, status: input.status, notes: input.notes, updatedBy: user.id, updatedAt: new Date() };
  if (input.id) {
    const [e] = await db().select({ id: events.id }).from(events).where(eq(events.id, input.id));
    if (!e) throw new UserError("Event not found.");
    await db().update(events).set(values).where(eq(events.id, input.id));
    return input.id;
  }
  const id = uuidv7();
  await db().insert(events).values({ ...values, id, createdBy: user.id });
  return id;
}

// ---------------------------------------------------------------------------
// Opening balances and currency
// ---------------------------------------------------------------------------

export async function listOpeningBalances(user: Viewer) {
  requireAdmin(user);
  return db().select().from(openingBalances).orderBy(desc(openingBalances.asOnDate));
}

/** One opening balance per date (saving the same date again replaces it). */
export async function saveOpeningBalance(user: Viewer, input: z.output<typeof openingBalanceSchema>) {
  requireAdmin(user);
  await db().insert(openingBalances)
    .values({ asOnDate: input.as_on_date, cash: input.cash, bank: input.bank, createdBy: user.id, updatedBy: user.id })
    .onDuplicateKeyUpdate({ set: { cash: input.cash, bank: input.bank, updatedBy: user.id, updatedAt: new Date() } });
}

/** Currency code and symbol: the super admin's settings, like the rest of Settings. */
export async function saveCurrency(user: Viewer, input: z.output<typeof currencySchema>) {
  if (!requireAdmin(user).superAdmin) throw new AuthError("Only a super admin can do that.");
  await db().update(schoolSettings).set({ currencyCode: input.currency_code, currencySymbol: input.currency_symbol, updatedAt: new Date() })
    .where(eq(schoolSettings.id, 1));
}
