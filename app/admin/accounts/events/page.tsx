import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { eventTotals } from "@/lib/repo/accounting/books";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { EmptyState, PageHeader } from "@/components/page-header";
import { AccountsTabs, Money, StatusPill } from "@/components/accounts/common";
import { EventDialog } from "@/components/accounts/event-dialog";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage() {
  const user = await requireRole("headmaster");
  const [list, currency] = await Promise.all([eventTotals(user), getCurrency(user)]);
  return (
    <>
      <PageHeader title="Accounts" description="Events: budget against what was received and spent." actions={<EventDialog />} />
      <AccountsTabs active="/admin/accounts/events" />
      {!list.length ? <EmptyState title="No events yet.">Create one, then link receipts and vouchers to it.</EmptyState> : (
        <ul className="divide-y rounded-xl border text-sm">
          {list.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/accounts/events/${e.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-muted-foreground">{e.date ? formatDate(e.date) : "No date"}
                    {e.budgetCents !== null && <> · budget <Money cents={e.budgetCents} currency={currency} /></>}</p>
                </div>
                <span>In <Money cents={e.incomeCents} currency={currency} /></span>
                <span>Out <Money cents={e.expenseCents} currency={currency} /></span>
                <span className="font-semibold">Balance <Money cents={e.incomeCents - e.expenseCents} currency={currency} /></span>
                <StatusPill status={e.status === "closed" ? "closed" : e.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
