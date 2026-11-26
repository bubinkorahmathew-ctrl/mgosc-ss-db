import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText, Paperclip } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { listPayments, type PaymentFilters } from "@/lib/repo/accounting/payments";
import { listCategories, listEvents } from "@/lib/repo/accounting/setup";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { uuid } from "@/lib/validation/common";
import { toQuery } from "@/lib/validation/reports";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Field, NativeSelect } from "@/components/form/field";
import { AccountsTabs, Money, PeriodForm, periodFrom, StatusPill } from "@/components/accounts/common";
import { PaymentDialog } from "@/components/accounts/payment-dialog";

export const metadata: Metadata = { title: "Vouchers" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const STATUSES = ["draft", "approved", "paid", "void"] as const;

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/accounts/payments">) {
  const user = await requireRole("headmaster");
  const sp = await searchParams;
  const { from, to } = periodFrom(sp);
  const status = (STATUSES as readonly string[]).includes(one(sp.status)) ? one(sp.status) as PaymentFilters["status"] : undefined;
  const f: PaymentFilters = {
    from, to, status,
    categoryId: uuid.safeParse(one(sp.category)).success ? one(sp.category) : undefined,
    eventId: uuid.safeParse(one(sp.event)).success ? one(sp.event) : undefined,
  };
  const [rows, currency, categories, events] = await Promise.all([
    listPayments(user, f), getCurrency(user), listCategories(user, { type: "expense" }), listEvents(user),
  ]);
  const paid = rows.filter((p) => p.status === "paid").reduce((s, p) => s + toCents(p.amount), 0);

  return (
    <>
      <PageHeader title="Accounts" description="Payment vouchers: draft → approved → paid. Only paid vouchers count in the cash book."
        actions={<PaymentDialog today={todayISO()} categories={categories.map((c) => ({ id: c.id, label: c.name }))}
          events={events.filter((e) => e.status !== "closed").map((e) => ({ id: e.id, label: e.name }))} />} />
      <AccountsTabs active="/admin/accounts/payments" />
      <PeriodForm from={from} to={to}>
        <Field id="f-cat" label="Category">
          <NativeSelect id="f-cat" name="category" defaultValue={f.categoryId ?? ""}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="f-event" label="Event">
          <NativeSelect id="f-event" name="event" defaultValue={f.eventId ?? ""}>
            <option value="">All</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="f-status" label="Status">
          <NativeSelect id="f-status" name="status" defaultValue={status ?? ""}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </NativeSelect>
        </Field>
      </PeriodForm>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{rows.length} voucher{rows.length === 1 ? "" : "s"} · paid total <b><Money cents={paid} currency={currency} /></b></span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/payments?${toQuery({ from, to })}`} />}><Download /> Excel</Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/payments?${toQuery({ from, to, format: "pdf" })}`} target="_blank" rel="noopener" />}><FileText /> PDF</Button>
        </div>
      </div>
      {!rows.length ? <EmptyState title="No vouchers in this period." /> : (
        <ul className="divide-y rounded-xl border text-sm">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/accounts/payments/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.paidTo}</p>
                  <p className="text-muted-foreground">
                    <span className="font-mono">{p.voucherNo}</span> · {formatDate(p.paymentDate)} · {p.category}{p.event ? ` · ${p.event}` : ""}
                  </p>
                </div>
                {p.hasBill && <Paperclip className="size-4 text-muted-foreground" aria-label="Bill attached" />}
                <Money cents={toCents(p.amount)} currency={currency} className={p.status === "void" ? "text-muted-foreground line-through" : "font-semibold"} />
                <StatusPill status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
