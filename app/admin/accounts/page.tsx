import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { accountsDashboard } from "@/lib/repo/accounting/books";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { AccountsTabs, Money, PeriodForm, periodFrom, StatusPill } from "@/components/accounts/common";

export const metadata: Metadata = { title: "Accounting" };

export default async function AccountsHome({ searchParams }: PageProps<"/admin/accounts">) {
  const user = await requireRole("admin");
  const { from, to } = periodFrom(await searchParams, "year");
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [d, currency] = await Promise.all([accountsDashboard(user, from, to, monthStart, today), getCurrency(user)]);
  const tiles: [string, number, string?][] = [
    ["Income", d.incomeCents], ["Expense", d.expenseCents], ["Balance", d.balanceCents], ["Charity this month", d.charityThisMonthCents],
  ];

  return (
    <>
      <PageHeader title="Accounting" description={`${formatDate(from)} to ${formatDate(to)}`} />
      <AccountsTabs active="/admin/accounts" />
      <PeriodForm from={from} to={to} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([k, v]) => (
          <Card key={k} size="sm"><CardContent>
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-xl font-semibold"><Money cents={v} currency={currency} /></p>
          </CardContent></Card>
        ))}
      </div>
      {d.pendingVouchers > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {d.pendingVouchers} voucher{d.pendingVouchers === 1 ? " is" : "s are"} waiting to be approved or paid.{" "}
          <Link href="/admin/accounts/payments?status=draft" className="underline">Open vouchers</Link>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Events: budget and actual</CardTitle></CardHeader>
          <CardContent>
            {!d.events.length ? <EmptyState title="No open events." /> : (
              <ul className="divide-y text-sm">
                {d.events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/admin/accounts/events/${e.id}`} className="flex flex-wrap items-center gap-x-3 py-2 hover:underline">
                      <span className="min-w-0 flex-1 font-medium">{e.name}</span>
                      <span className="text-muted-foreground">budget {e.budgetCents === null ? "-" : <Money cents={e.budgetCents} currency={currency} />}</span>
                      <span>spent <Money cents={e.expenseCents} currency={currency} /></span>
                      <span>received <Money cents={e.incomeCents} currency={currency} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent entries</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[...d.recentReceipts.map((r) => ({ ...r, kind: "in" as const })), ...d.recentPayments.map((p) => ({ ...p, kind: "out" as const }))]
              .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="font-mono text-xs">{r.no}</span>
                  <span className="min-w-0 flex-1 truncate">{r.party}</span>
                  <Money cents={(r.kind === "in" ? 1 : -1) * toCents(r.amount)} currency={currency} />
                  {r.status !== "active" && r.status !== "paid" && <StatusPill status={r.status} />}
                </div>
              ))}
            {!d.recentReceipts.length && !d.recentPayments.length && <EmptyState title="Nothing entered yet." />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
