import type { NextRequest } from "next/server";
import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { formatMoney, fromCents, toCents } from "@/lib/money";
import * as books from "@/lib/repo/accounting/books";
import { listPayments } from "@/lib/repo/accounting/payments";
import { listReceipts } from "@/lib/repo/accounting/receipts";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { loadBanner } from "@/lib/pdf/images";
import { renderTableReport } from "@/lib/pdf/table-report";
import { uuid } from "@/lib/validation/common";
import { PAYMENT_MODE_LABELS, periodSchema } from "@/lib/validation/accounts";
import { buildXlsx, xlsxResponse, type XlsxSheet } from "@/lib/xlsx";
import { isAdmin } from "@/lib/permissions";

/**
 * GET /api/accounts/export/{cash-book|income|expense|charity|event|students|teachers|voided|receipts|payments}
 *   ?from=&to=[&book=cash|bank][&event=<id>][&format=pdf]
 * Admins only. Excel by default; amounts are numbers in Excel and formatted text in the PDF.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/accounts/export/[report]">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  if (!isAdmin(user.profile.role)) return textResponse(403, "Not allowed.");
  const { report } = await ctx.params;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const pdf = sp.format === "pdf";
  const currency = await getCurrency(user);
  const money = (cents: number) => (pdf ? formatMoney(cents, currency) : Number(fromCents(cents)));
  const period = periodSchema.safeParse({ from: sp.from, to: sp.to });
  const needsPeriod = report !== "event";
  if (needsPeriod && !period.success) return textResponse(400, "Choose a start and end date.");
  const { from, to } = period.success ? period.data : { from: "", to: "" };
  const range = needsPeriod ? `${formatDate(from)} to ${formatDate(to)}` : "";

  let sheet: XlsxSheet;
  let filename: string;
  switch (report) {
    case "cash-book": {
      const book = sp.book === "cash" || sp.book === "bank" ? sp.book : "all";
      const cb = await books.cashBook(user, from, to, book);
      sheet = {
        name: "Cash book", title: `Cash book${book === "all" ? "" : ` (${book})`} · ${range}`,
        columns: [
          { header: "Date", key: "date", width: 11 }, { header: "No.", key: "no", width: 15 }, { header: "Particulars", key: "party", width: 28 },
          { header: "Category", key: "category", width: 20 }, { header: "Mode", key: "mode", width: 10 },
          { header: "Receipts", key: "in", width: 13 }, { header: "Payments", key: "out", width: 13 }, { header: "Balance", key: "bal", width: 14 },
        ],
        rows: [
          { date: formatDate(from), party: "Opening balance", bal: money(cb.openingCents) },
          ...cb.lines.map((l) => ({
            date: formatDate(l.date), no: l.no, party: l.party, category: l.category, mode: modeLabel(l.mode),
            in: l.inCents ? money(l.inCents) : "", out: l.outCents ? money(l.outCents) : "", bal: money(l.balanceCents),
          })),
          { date: formatDate(to), party: "Closing balance", in: money(cb.totalInCents), out: money(cb.totalOutCents), bal: money(cb.closingCents) },
        ],
      };
      filename = `Cash book ${from} ${to}`;
      break;
    }
    case "income":
    case "expense": {
      const rows = await books.totalsByCategory(user, report, from, to);
      const total = rows.reduce((s, r) => s + r.totalCents, 0);
      sheet = {
        name: report === "income" ? "Income" : "Expense", title: `${report === "income" ? "Income" : "Expense"} by category · ${range}`,
        columns: [{ header: "Category", key: "category", width: 28 }, { header: "Entries", key: "count", width: 9 }, { header: "Amount", key: "amount", width: 15 }],
        rows: [...rows.map((r) => ({ ...r, amount: money(r.totalCents) })), { category: "Total", count: rows.reduce((s, r) => s + r.count, 0), amount: money(total) }],
      };
      filename = `${sheet.name} by category ${from} ${to}`;
      break;
    }
    case "charity": {
      const rows = await books.charityByClassAndMonth(user, from, to);
      sheet = {
        name: "Charity", title: `Charity collection by class and month · ${range}`,
        columns: [{ header: "Class", key: "className", width: 24 }, { header: "Month", key: "month", width: 10 }, { header: "Amount", key: "amount", width: 15 }],
        rows: rows.sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || a.month.localeCompare(b.month))
          .map((r) => ({ ...r, amount: money(r.totalCents) })),
      };
      filename = `Charity ${from} ${to}`;
      break;
    }
    case "event": {
      const id = uuid.safeParse(sp.event);
      if (!id.success) return textResponse(400, "Choose an event.");
      const st = await books.eventStatement(user, id.data);
      if (!st) return textResponse(404, "Event not found.");
      sheet = {
        name: "Event", title: `${st.event.name} · income ${formatMoney(st.incomeCents, currency)}, expense ${formatMoney(st.expenseCents, currency)}, balance ${formatMoney(st.balanceCents, currency)}${st.budgetCents !== null ? `, budget ${formatMoney(st.budgetCents, currency)}` : ""}`,
        columns: [
          { header: "Date", key: "date", width: 11 }, { header: "No.", key: "no", width: 15 }, { header: "Particulars", key: "party", width: 26 },
          { header: "Category", key: "category", width: 20 }, { header: "Status", key: "status", width: 9 },
          { header: "Income", key: "in", width: 13 }, { header: "Expense", key: "out", width: 13 },
        ],
        rows: [
          ...st.receipts.map((r) => ({ ...r, date: formatDate(r.date), in: money(toCents(r.amount)) })),
          ...st.payments.map((p) => ({ ...p, date: formatDate(p.date), out: money(toCents(p.amount)) })),
        ],
      };
      filename = `Event ${st.event.name}`;
      break;
    }
    case "students":
    case "teachers": {
      const rows = await books.contributions(user, report === "students" ? "student" : "teacher", from, to);
      sheet = {
        name: report === "students" ? "Students" : "Teachers", title: `${report === "students" ? "Student" : "Teacher"}-wise contributions · ${range}`,
        columns: [
          { header: "Name", key: "name", width: 26 }, ...(report === "students" ? [{ header: "Class", key: "className", width: 14 }] : []),
          { header: "Receipts", key: "count", width: 9 }, { header: "Amount", key: "amount", width: 15 },
        ],
        rows: rows.map((r) => ({ ...r, amount: money(r.totalCents) })),
      };
      filename = `${sheet.name} contributions ${from} ${to}`;
      break;
    }
    case "voided": {
      const rows = await books.voidedEntries(user, from, to);
      sheet = {
        name: "Voided", title: `Voided entries · ${range}`,
        columns: [
          { header: "Type", key: "kind", width: 9 }, { header: "No.", key: "no", width: 15 }, { header: "Date", key: "date", width: 11 },
          { header: "Particulars", key: "party", width: 24 }, { header: "Amount", key: "amount", width: 13 }, { header: "Reason", key: "reason", width: 30 },
        ],
        rows: rows.map((r) => ({ ...r, date: formatDate(r.date), amount: money(toCents(r.amount)) })),
      };
      filename = `Voided entries ${from} ${to}`;
      break;
    }
    case "receipts": {
      const rows = await listReceipts(user, { from, to }, 20000);
      sheet = {
        name: "Receipts", title: `Receipts · ${range}`,
        columns: [
          { header: "No.", key: "receiptNo", width: 15 }, { header: "Date", key: "date", width: 11 }, { header: "Received from", key: "name", width: 24 },
          { header: "Class", key: "cls", width: 12 }, { header: "Category", key: "category", width: 18 }, { header: "Event", key: "event", width: 16 },
          { header: "Mode", key: "modeF", width: 10 }, { header: "Amount", key: "amt", width: 13 }, { header: "Status", key: "status", width: 8 },
        ],
        rows: rows.map((r) => ({ ...r, date: formatDate(r.receiptDate), cls: r.className ?? "", modeF: modeLabel(r.mode), amt: money(toCents(r.amount)) })),
      };
      filename = `Receipts ${from} ${to}`;
      break;
    }
    case "payments": {
      const rows = await listPayments(user, { from, to }, 20000);
      sheet = {
        name: "Vouchers", title: `Payment vouchers · ${range}`,
        columns: [
          { header: "No.", key: "voucherNo", width: 15 }, { header: "Date", key: "date", width: 11 }, { header: "Paid to", key: "paidTo", width: 24 },
          { header: "Category", key: "category", width: 18 }, { header: "Event", key: "event", width: 16 }, { header: "Mode", key: "modeF", width: 10 },
          { header: "Amount", key: "amt", width: 13 }, { header: "Status", key: "status", width: 9 },
        ],
        rows: rows.map((p) => ({ ...p, date: formatDate(p.paymentDate), modeF: modeLabel(p.mode), amt: money(toCents(p.amount)) })),
      };
      filename = `Vouchers ${from} ${to}`;
      break;
    }
    default:
      return textResponse(404, "Unknown report.");
  }
  if (pdf) return pdfResponse(await renderTableReport([sheet], await loadBanner()), `${filename}.pdf`, sp.download === "1");
  return xlsxResponse(await buildXlsx([sheet]), `${filename}.xlsx`);
}

function modeLabel(mode: string) {
  return PAYMENT_MODE_LABELS[mode as keyof typeof PAYMENT_MODE_LABELS] ?? mode;
}

