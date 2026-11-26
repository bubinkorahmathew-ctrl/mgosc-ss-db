import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { eventStatement } from "@/lib/repo/accounting/books";
import { listCategories } from "@/lib/repo/accounting/setup";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Money, StatusPill } from "@/components/accounts/common";
import { EventDialog } from "@/components/accounts/event-dialog";
import { PaymentDialog } from "@/components/accounts/payment-dialog";

export const metadata: Metadata = { title: "Event" };

export default async function EventPage({ params }: PageProps<"/admin/accounts/events/[id]">) {
  const user = await requireRole("headmaster");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [st, currency, expense] = await Promise.all([
    eventStatement(user, id), getCurrency(user), listCategories(user, { type: "expense" }),
  ]);
  if (!st) notFound();
  const e = st.event;
  const tiles: [string, number | null][] = [
    ["Budget", st.budgetCents], ["Received", st.incomeCents], ["Spent", st.expenseCents], ["Balance", st.balanceCents],
  ];

  return (
    <>
      <Link href="/admin/accounts/events" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Events
      </Link>
      <PageHeader title={e.name} description={`${e.eventDate ? formatDate(e.eventDate) : "No date"} · ${e.status}`}
        actions={<div className="flex flex-wrap gap-2">
          <EventDialog event={{ id: e.id, name: e.name, event_date: e.eventDate ?? "", budget: e.budget ?? "", status: e.status, notes: e.notes ?? "" }} />
          <PaymentDialog today={todayISO()} defaultEvent={e.id} categories={expense.map((c) => ({ id: c.id, label: c.name }))} events={[{ id: e.id, label: e.name }]} />
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/event?event=${e.id}`} />}><Download /> Excel</Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/event?event=${e.id}&format=pdf`} target="_blank" rel="noopener" />}><FileText /> PDF</Button>
        </div>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([k, v]) => (
          <Card key={k} size="sm"><CardContent>
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-lg font-semibold">{v === null ? "-" : <Money cents={v} currency={currency} />}</p>
          </CardContent></Card>
        ))}
      </div>
      {e.notes && <p className="mb-4 text-sm text-muted-foreground">{e.notes}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="ev-in">
          <h2 id="ev-in" className="mb-2 font-semibold">Receipts</h2>
          {!st.receipts.length ? <EmptyState title="No receipts linked yet." /> : (
            <ul className="divide-y rounded-xl border text-sm">
              {st.receipts.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">{r.party}<span className="block text-xs text-muted-foreground">{r.no} · {formatDate(r.date)} · {r.category}</span></span>
                  <Money cents={toCents(r.amount)} currency={currency} className={r.status === "void" ? "line-through text-muted-foreground" : ""} />
                  {r.status === "void" && <StatusPill status="void" />}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="ev-out">
          <h2 id="ev-out" className="mb-2 font-semibold">Vouchers</h2>
          {!st.payments.length ? <EmptyState title="No vouchers linked yet." /> : (
            <ul className="divide-y rounded-xl border text-sm">
              {st.payments.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/accounts/payments/${p.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
                    <span className="min-w-0 flex-1">{p.party}<span className="block text-xs text-muted-foreground">{p.no} · {formatDate(p.date)} · {p.category}</span></span>
                    <Money cents={toCents(p.amount)} currency={currency} className={p.status === "void" ? "line-through text-muted-foreground" : ""} />
                    <StatusPill status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
