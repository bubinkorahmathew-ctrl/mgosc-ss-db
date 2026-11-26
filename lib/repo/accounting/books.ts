import "server-only";
/**
 * The cash book, the accounts dashboard and the accounting reports. Admins only.
 * Rules: an active receipt counts on its date; a voucher counts only once it is paid, on its
 * payment date. "online" counts as bank. Sums are done by the database on DECIMAL columns and
 * then in whole minor units (lib/money.ts): never floating point.
 */
import { and, asc, desc, eq, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import { classes } from "@/db/schema";
import { accountCategories, events, openingBalances, payments, receipts } from "@/db/schema/accounts";
import { fromCents, toCents } from "@/lib/money";
import type { Viewer } from "../access";
import { CHARITY_CATEGORY } from "./receipts";
import { db, requireAdmin } from "./shared";

export type Book = "all" | "cash" | "bank";

const modesOf = (book: Book) => (book === "cash" ? ["cash"] as const : book === "bank" ? ["bank", "online"] as const : ["cash", "bank", "online"] as const);
const cents = (v: string | null | undefined) => (v ? toCents(v.replace(/^-/, "")) * (v.startsWith("-") ? -1 : 1) : 0);

async function receiptTotal(where: SQL[]) {
  const [r] = await db().select({ t: sql<string | null>`sum(${receipts.amount})` }).from(receipts)
    .where(and(eq(receipts.status, "active"), ...where));
  return cents(r?.t);
}
async function paymentTotal(where: SQL[]) {
  const [p] = await db().select({ t: sql<string | null>`sum(${payments.amount})` }).from(payments)
    .where(and(eq(payments.status, "paid"), ...where));
  return cents(p?.t);
}

/** Balance at the start of `date` (cash, bank or both), from the latest opening balance on or before it. */
async function balanceBefore(date: string, book: Book): Promise<{ cents: number; from: string | null }> {
  const [ob] = await db().select().from(openingBalances).where(lte(openingBalances.asOnDate, date))
    .orderBy(desc(openingBalances.asOnDate)).limit(1);
  const start = ob ? (book === "cash" ? cents(ob.cash) : book === "bank" ? cents(ob.bank) : cents(ob.cash) + cents(ob.bank)) : 0;
  const modes = [...modesOf(book)];
  const since = ob ? ob.asOnDate : "0001-01-01";
  const [inc, exp] = await Promise.all([
    receiptTotal([inArray(receipts.paymentMode, modes), gte(receipts.receiptDate, since), lt(receipts.receiptDate, date)]),
    paymentTotal([inArray(payments.paymentMode, modes), gte(payments.paymentDate, since), lt(payments.paymentDate, date)]),
  ]);
  return { cents: start + inc - exp, from: ob?.asOnDate ?? null };
}

export type CashBookLine = {
  date: string; kind: "receipt" | "payment"; id: string; no: string; party: string; category: string;
  mode: string; inCents: number; outCents: number; balanceCents: number;
};

/** Date-wise ledger: opening balance, receipts, payments, running and closing balance. */
export async function cashBook(user: Viewer, from: string, to: string, book: Book = "all") {
  requireAdmin(user);
  const modes = [...modesOf(book)];
  const d = db();
  const [opening, ins, outs] = await Promise.all([
    balanceBefore(from, book),
    d.select({ id: receipts.id, no: receipts.receiptNo, date: receipts.receiptDate, party: receipts.receivedFromName,
      amount: receipts.amount, mode: receipts.paymentMode, category: accountCategories.name })
      .from(receipts).innerJoin(accountCategories, eq(accountCategories.id, receipts.categoryId))
      .where(and(eq(receipts.status, "active"), inArray(receipts.paymentMode, modes), gte(receipts.receiptDate, from), lte(receipts.receiptDate, to))),
    d.select({ id: payments.id, no: payments.voucherNo, date: payments.paymentDate, party: payments.paidTo,
      amount: payments.amount, mode: payments.paymentMode, category: accountCategories.name })
      .from(payments).innerJoin(accountCategories, eq(accountCategories.id, payments.categoryId))
      .where(and(eq(payments.status, "paid"), inArray(payments.paymentMode, modes), gte(payments.paymentDate, from), lte(payments.paymentDate, to))),
  ]);
  const rows = [
    ...ins.map((r) => ({ ...r, kind: "receipt" as const, inCents: toCents(r.amount), outCents: 0 })),
    ...outs.map((p) => ({ ...p, kind: "payment" as const, inCents: 0, outCents: toCents(p.amount) })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.no.localeCompare(b.no) : a.kind === "receipt" ? -1 : 1));
  let balance = opening.cents;
  const lines: CashBookLine[] = rows.map((r) => {
    balance += r.inCents - r.outCents;
    return { date: r.date, kind: r.kind, id: r.id, no: r.no, party: r.party, category: r.category, mode: r.mode,
      inCents: r.inCents, outCents: r.outCents, balanceCents: balance };
  });
  const totalIn = lines.reduce((s, l) => s + l.inCents, 0);
  const totalOut = lines.reduce((s, l) => s + l.outCents, 0);
  return { from, to, book, openingCents: opening.cents, openingFrom: opening.from, lines, totalInCents: totalIn, totalOutCents: totalOut, closingCents: opening.cents + totalIn - totalOut };
}

/** The accounts home page. */
export async function accountsDashboard(user: Viewer, from: string, to: string, monthStart: string, monthEnd: string) {
  requireAdmin(user);
  const d = db();
  const [income, expense, charity, eventList, recentIn, recentOut, pendingVouchers] = await Promise.all([
    receiptTotal([gte(receipts.receiptDate, from), lte(receipts.receiptDate, to)]),
    paymentTotal([gte(payments.paymentDate, from), lte(payments.paymentDate, to)]),
    d.select({ t: sql<string | null>`sum(${receipts.amount})` }).from(receipts)
      .innerJoin(accountCategories, eq(accountCategories.id, receipts.categoryId))
      .where(and(eq(receipts.status, "active"), eq(accountCategories.name, CHARITY_CATEGORY),
        gte(receipts.receiptDate, monthStart), lte(receipts.receiptDate, monthEnd))),
    eventTotals(user),
    d.select({ id: receipts.id, no: receipts.receiptNo, date: receipts.receiptDate, party: receipts.receivedFromName, amount: receipts.amount, status: receipts.status })
      .from(receipts).orderBy(desc(receipts.createdAt)).limit(6),
    d.select({ id: payments.id, no: payments.voucherNo, date: payments.paymentDate, party: payments.paidTo, amount: payments.amount, status: payments.status })
      .from(payments).orderBy(desc(payments.createdAt)).limit(6),
    d.$count(payments, inArray(payments.status, ["draft", "approved"])),
  ]);
  return {
    incomeCents: income, expenseCents: expense, balanceCents: income - expense, charityThisMonthCents: cents(charity[0]?.t),
    events: eventList.filter((e) => e.status !== "closed").slice(0, 8),
    recentReceipts: recentIn, recentPayments: recentOut, pendingVouchers,
  };
}

/** Budget against actual for every event. */
export async function eventTotals(user: Viewer) {
  requireAdmin(user);
  const d = db();
  const [list, inc, exp] = await Promise.all([
    d.select().from(events).orderBy(desc(events.eventDate), asc(events.name)),
    d.select({ id: receipts.eventId, t: sql<string>`sum(${receipts.amount})` }).from(receipts)
      .where(and(eq(receipts.status, "active"), sql`${receipts.eventId} is not null`)).groupBy(receipts.eventId),
    d.select({ id: payments.eventId, t: sql<string>`sum(${payments.amount})` }).from(payments)
      .where(and(eq(payments.status, "paid"), sql`${payments.eventId} is not null`)).groupBy(payments.eventId),
  ]);
  const i = new Map(inc.map((r) => [r.id, cents(r.t)]));
  const e = new Map(exp.map((r) => [r.id, cents(r.t)]));
  return list.map((ev) => ({
    id: ev.id, name: ev.name, date: ev.eventDate, status: ev.status,
    budgetCents: ev.budget === null ? null : cents(ev.budget),
    incomeCents: i.get(ev.id) ?? 0, expenseCents: e.get(ev.id) ?? 0,
  }));
}

/** An event's receipts and paid/pending vouchers, with totals. */
export async function eventStatement(user: Viewer, eventId: string) {
  requireAdmin(user);
  const d = db();
  const [[event], ins, outs] = await Promise.all([
    d.select().from(events).where(eq(events.id, eventId)),
    d.select({ id: receipts.id, no: receipts.receiptNo, date: receipts.receiptDate, party: receipts.receivedFromName,
      amount: receipts.amount, status: receipts.status, category: accountCategories.name, mode: receipts.paymentMode })
      .from(receipts).innerJoin(accountCategories, eq(accountCategories.id, receipts.categoryId))
      .where(eq(receipts.eventId, eventId)).orderBy(asc(receipts.receiptDate), asc(receipts.receiptNo)),
    d.select({ id: payments.id, no: payments.voucherNo, date: payments.paymentDate, party: payments.paidTo,
      amount: payments.amount, status: payments.status, category: accountCategories.name, mode: payments.paymentMode })
      .from(payments).innerJoin(accountCategories, eq(accountCategories.id, payments.categoryId))
      .where(eq(payments.eventId, eventId)).orderBy(asc(payments.paymentDate), asc(payments.voucherNo)),
  ]);
  if (!event) return null;
  const incomeCents = ins.filter((r) => r.status === "active").reduce((s, r) => s + toCents(r.amount), 0);
  const expenseCents = outs.filter((p) => p.status === "paid").reduce((s, p) => s + toCents(p.amount), 0);
  return { event, receipts: ins, payments: outs, incomeCents, expenseCents, balanceCents: incomeCents - expenseCents,
    budgetCents: event.budget === null ? null : cents(event.budget) };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** Income (active receipts) or expense (paid vouchers) per category in a period. */
export async function totalsByCategory(user: Viewer, type: "income" | "expense", from: string, to: string) {
  requireAdmin(user);
  const rows = type === "income"
    ? await db().select({ category: accountCategories.name, n: sql<number>`count(*)`, t: sql<string>`sum(${receipts.amount})` })
      .from(receipts).innerJoin(accountCategories, eq(accountCategories.id, receipts.categoryId))
      .where(and(eq(receipts.status, "active"), gte(receipts.receiptDate, from), lte(receipts.receiptDate, to)))
      .groupBy(accountCategories.name).orderBy(accountCategories.name)
    : await db().select({ category: accountCategories.name, n: sql<number>`count(*)`, t: sql<string>`sum(${payments.amount})` })
      .from(payments).innerJoin(accountCategories, eq(accountCategories.id, payments.categoryId))
      .where(and(eq(payments.status, "paid"), gte(payments.paymentDate, from), lte(payments.paymentDate, to)))
      .groupBy(accountCategories.name).orderBy(accountCategories.name);
  return rows.map((r) => ({ category: r.category, count: Number(r.n), totalCents: cents(r.t) }));
}

/** Charity per class and month (YYYY-MM), by the class the student was in when giving. */
export async function charityByClassAndMonth(user: Viewer, from: string, to: string) {
  requireAdmin(user);
  const month = sql<string>`date_format(${receipts.receiptDate}, '%Y-%m')`;
  const rows = await db().select({ classId: receipts.classId, name: classes.name, section: classes.section, month, t: sql<string>`sum(${receipts.amount})` })
    .from(receipts)
    .innerJoin(accountCategories, eq(accountCategories.id, receipts.categoryId))
    .leftJoin(classes, eq(classes.id, receipts.classId))
    .where(and(eq(receipts.status, "active"), eq(accountCategories.name, CHARITY_CATEGORY), gte(receipts.receiptDate, from), lte(receipts.receiptDate, to)))
    .groupBy(receipts.classId, classes.name, classes.section, month);
  return rows.map((r) => ({
    className: r.name ? (r.section ? `${r.name} - ${r.section}` : r.name) : "No class (teachers, others)",
    month: r.month, totalCents: cents(r.t),
  }));
}

/** What each student (or teacher) gave in a period, all income categories. */
export async function contributions(user: Viewer, who: "student" | "teacher", from: string, to: string) {
  requireAdmin(user);
  const key = who === "student" ? receipts.studentId : receipts.teacherId;
  const rows = await db().select({
    id: key, name: sql<string>`max(${receipts.receivedFromName})`, className: sql<string | null>`max(${classes.name})`,
    n: sql<number>`count(*)`, t: sql<string>`sum(${receipts.amount})`,
  }).from(receipts).leftJoin(classes, eq(classes.id, receipts.classId))
    .where(and(eq(receipts.status, "active"), eq(receipts.receivedFromType, who), gte(receipts.receiptDate, from), lte(receipts.receiptDate, to)))
    .groupBy(key).orderBy(sql`max(${receipts.receivedFromName})`);
  return rows.map((r) => ({ id: r.id!, name: r.name, className: r.className, count: Number(r.n), totalCents: cents(r.t) }));
}

/** Every voided receipt and voucher in a period, with the reason. */
export async function voidedEntries(user: Viewer, from: string, to: string) {
  requireAdmin(user);
  const d = db();
  const [ins, outs] = await Promise.all([
    d.select({ no: receipts.receiptNo, date: receipts.receiptDate, party: receipts.receivedFromName, amount: receipts.amount, reason: receipts.voidReason })
      .from(receipts).where(and(eq(receipts.status, "void"), gte(receipts.receiptDate, from), lte(receipts.receiptDate, to))),
    d.select({ no: payments.voucherNo, date: payments.paymentDate, party: payments.paidTo, amount: payments.amount, reason: payments.voidReason })
      .from(payments).where(and(eq(payments.status, "void"), gte(payments.paymentDate, from), lte(payments.paymentDate, to))),
  ]);
  return [...ins.map((r) => ({ ...r, kind: "Receipt" })), ...outs.map((p) => ({ ...p, kind: "Voucher" }))]
    .sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
}

export { fromCents };
