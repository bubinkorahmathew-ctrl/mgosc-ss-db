import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { getClassOptions } from "@/lib/repo/classes";
import { listReceipts, payerOptions, type ReceiptFilters } from "@/lib/repo/accounting/receipts";
import { listCategories, listEvents } from "@/lib/repo/accounting/setup";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { uuid } from "@/lib/validation/common";
import { PAYMENT_MODE_LABELS, PAYMENT_MODES } from "@/lib/validation/accounts";
import { toQuery } from "@/lib/validation/reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Field, NativeSelect } from "@/components/form/field";
import { AccountsTabs, Money, PeriodForm, periodFrom, StatusPill } from "@/components/accounts/common";
import { ReceiptDialog } from "@/components/accounts/receipt-dialog";
import { VoidButton } from "@/components/accounts/void-button";

export const metadata: Metadata = { title: "Receipts" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const id = (v: string) => (uuid.safeParse(v).success ? v : undefined);

export default async function ReceiptsPage({ searchParams }: PageProps<"/admin/accounts/receipts">) {
  const user = await requireRole("admin");
  const sp = await searchParams;
  const { from, to } = periodFrom(sp);
  const mode = (PAYMENT_MODES as readonly string[]).includes(one(sp.mode)) ? one(sp.mode) as ReceiptFilters["mode"] : undefined;
  const status = one(sp.status) === "active" || one(sp.status) === "void" ? one(sp.status) as ReceiptFilters["status"] : undefined;
  const f: ReceiptFilters = {
    from, to, mode, status, categoryId: id(one(sp.category)), classId: id(one(sp.class)), eventId: id(one(sp.event)),
    q: one(sp.q).slice(0, 60) || undefined,
  };

  const [rows, currency, payers, categories, events, classes] = await Promise.all([
    listReceipts(user, f), getCurrency(user), payerOptions(user), listCategories(user, { type: "income" }), listEvents(user),
    getClassOptions(user),
  ]);
  const active = rows.filter((r) => r.status === "active");
  const total = active.reduce((s, r) => s + toCents(r.amount), 0);
  const eventOpts = events.filter((e) => e.status !== "closed").map((e) => ({ id: e.id, label: e.name }));

  return (
    <>
      <PageHeader title="Accounting" description="Receipts: money received."
        actions={<ReceiptDialog students={payers.students} teachers={payers.teachers} today={todayISO()}
          categories={categories.map((c) => ({ id: c.id, label: c.name }))} events={eventOpts} />} />
      <AccountsTabs active="/admin/accounts/receipts" />

      <PeriodForm from={from} to={to}>
        <Field id="f-cat" label="Category">
          <NativeSelect id="f-cat" name="category" defaultValue={f.categoryId ?? ""}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="f-class" label="Class">
          <NativeSelect id="f-class" name="class" defaultValue={f.classId ?? ""}>
            <option value="">All</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.isCurrent ? c.label : `${c.label} (${c.yearName})`}</option>)}
          </NativeSelect>
        </Field>
        <Field id="f-event" label="Event">
          <NativeSelect id="f-event" name="event" defaultValue={f.eventId ?? ""}>
            <option value="">All</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="f-mode" label="Paid by">
          <NativeSelect id="f-mode" name="mode" defaultValue={mode ?? ""}>
            <option value="">All</option>
            {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>)}
          </NativeSelect>
        </Field>
        <Field id="f-status" label="Status">
          <NativeSelect id="f-status" name="status" defaultValue={status ?? ""}>
            <option value="">All</option>
            <option value="active">Valid</option>
            <option value="void">Void</option>
          </NativeSelect>
        </Field>
        <Field id="f-q" label="Search"><Input id="f-q" name="q" defaultValue={f.q ?? ""} placeholder="Name or RCT number" /></Field>
      </PeriodForm>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{rows.length} receipt{rows.length === 1 ? "" : "s"} · valid total <b><Money cents={total} currency={currency} /></b></span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/receipts?${toQuery({ from, to })}`} />}><Download /> Excel</Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/receipts?${toQuery({ from, to, format: "pdf" })}`} target="_blank" rel="noopener" />}><FileText /> PDF</Button>
        </div>
      </div>
      {!rows.length ? <EmptyState title="No receipts in this period." /> : (
        <ul className="divide-y rounded-xl border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name}{r.className && <span className="font-normal text-muted-foreground"> · {r.classSection ? `${r.className} - ${r.classSection}` : r.className}</span>}</p>
                <p className="text-muted-foreground">
                  <span className="font-mono">{r.receiptNo}</span> · {formatDate(r.receiptDate)} · {r.category}{r.event ? ` · ${r.event}` : ""} · {PAYMENT_MODE_LABELS[r.mode]}
                  {r.status === "void" && <span className="ml-1">· void: {r.voidReason}</span>}
                </p>
              </div>
              <Money cents={toCents(r.amount)} currency={currency} className={r.status === "void" ? "text-muted-foreground line-through" : "font-semibold"} />
              <StatusPill status={r.status} />
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/accounts/receipts/${r.id}/pdf`} target="_blank" rel="noopener" />}>
                <FileText /> PDF
              </Button>
              {r.status === "active" && <VoidButton kind="receipt" id={r.id} no={r.receiptNo} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
