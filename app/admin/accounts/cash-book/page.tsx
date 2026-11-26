import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { cashBook, type Book } from "@/lib/repo/accounting/books";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { PAYMENT_MODE_LABELS } from "@/lib/validation/accounts";
import { toQuery } from "@/lib/validation/reports";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Field, NativeSelect } from "@/components/form/field";
import { AccountsTabs, Money, PeriodForm, periodFrom } from "@/components/accounts/common";

export const metadata: Metadata = { title: "Cash book" };

export default async function CashBookPage({ searchParams }: PageProps<"/admin/accounts/cash-book">) {
  const user = await requireRole("headmaster");
  const sp = await searchParams;
  const { from, to } = periodFrom(sp);
  const book: Book = sp.book === "cash" || sp.book === "bank" ? sp.book : "all";
  const [cb, currency] = await Promise.all([cashBook(user, from, to, book), getCurrency(user)]);
  const q = { from, to, ...(book !== "all" && { book }) };

  return (
    <>
      <PageHeader title="Accounts" description="Cash book: valid receipts and paid vouchers, day by day. Online counts as bank." />
      <AccountsTabs active="/admin/accounts/cash-book" />
      <PeriodForm from={from} to={to}>
        <Field id="f-book" label="Book">
          <NativeSelect id="f-book" name="book" defaultValue={book}>
            <option value="all">Cash and bank</option>
            <option value="cash">Cash only</option>
            <option value="bank">Bank only (incl. online)</option>
          </NativeSelect>
        </Field>
      </PeriodForm>
      <div className="mb-2 flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/cash-book?${toQuery(q)}`} />}><Download /> Excel</Button>
        <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/cash-book?${toQuery({ ...q, format: "pdf" })}`} target="_blank" rel="noopener" />}><FileText /> PDF</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              {["Date", "No.", "Particulars", "Category", "Mode"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
              {["Receipts", "Payments", "Balance"].map((h) => <th key={h} scope="col" className="px-3 py-2 text-right font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="bg-muted/20 font-medium">
              <td className="px-3 py-2">{formatDate(from)}</td>
              <td colSpan={4} className="px-3 py-2">Opening balance{cb.openingFrom ? ` (from the opening balance of ${formatDate(cb.openingFrom)})` : " (no opening balance set)"}</td>
              <td /><td />
              <td className="px-3 py-2 text-right"><Money cents={cb.openingCents} currency={currency} /></td>
            </tr>
            {cb.lines.map((l) => (
              <tr key={`${l.kind}:${l.id}`}>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.date)}</td>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{l.no}</td>
                <td className="px-3 py-2">{l.party}</td>
                <td className="px-3 py-2">{l.category}</td>
                <td className="px-3 py-2">{PAYMENT_MODE_LABELS[l.mode as keyof typeof PAYMENT_MODE_LABELS]}</td>
                <td className="px-3 py-2 text-right">{l.inCents ? <Money cents={l.inCents} currency={currency} /> : ""}</td>
                <td className="px-3 py-2 text-right">{l.outCents ? <Money cents={l.outCents} currency={currency} /> : ""}</td>
                <td className="px-3 py-2 text-right"><Money cents={l.balanceCents} currency={currency} /></td>
              </tr>
            ))}
            <tr className="bg-muted/20 font-semibold">
              <td className="px-3 py-2">{formatDate(to)}</td>
              <td colSpan={4} className="px-3 py-2">Closing balance ({cb.lines.length} entr{cb.lines.length === 1 ? "y" : "ies"})</td>
              <td className="px-3 py-2 text-right"><Money cents={cb.totalInCents} currency={currency} /></td>
              <td className="px-3 py-2 text-right"><Money cents={cb.totalOutCents} currency={currency} /></td>
              <td className="px-3 py-2 text-right"><Money cents={cb.closingCents} currency={currency} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
