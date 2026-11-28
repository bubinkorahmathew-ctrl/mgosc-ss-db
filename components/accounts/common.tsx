import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, type Currency } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { isoDate } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";

const TABS = [
  { href: "/admin/accounts", label: "Overview" },
  { href: "/admin/accounts/receipts", label: "Receipts" },
  { href: "/admin/accounts/charity", label: "Charity" },
  { href: "/admin/accounts/payments", label: "Vouchers" },
  { href: "/admin/accounts/events", label: "Events" },
  { href: "/admin/accounts/cash-book", label: "Cash book" },
  { href: "/admin/accounts/reports", label: "Reports" },
  { href: "/admin/accounts/settings", label: "Settings" },
];

/** The accounts section's own tabs. */
export function AccountsTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Accounting" className="mb-4 flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === active ? "page" : undefined}
          className={cn("min-h-11 shrink-0 border-b-2 px-3 pt-3 text-sm font-medium",
            t.href === active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** ?from=&to= from the URL, defaulting to this month so far. */
export function periodFrom(sp: SP, fallback: "month" | "year" = "month") {
  const today = todayISO();
  const start = fallback === "year" ? `${today.slice(0, 4)}-01-01` : `${today.slice(0, 7)}-01`;
  let from = isoDate.safeParse(one(sp.from)).success ? one(sp.from) : start;
  let to = isoDate.safeParse(one(sp.to)).success ? one(sp.to) : today;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

/** A GET form for the period (and any extra filters passed as children). */
export function PeriodForm({ from, to, children, hidden = {} }: {
  from: string; to: string; children?: React.ReactNode; hidden?: Record<string, string>;
}) {
  return (
    <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Field id="p-from" label="From"><Input id="p-from" name="from" type="date" defaultValue={from} /></Field>
      <Field id="p-to" label="To"><Input id="p-to" name="to" type="date" defaultValue={to} /></Field>
      {children}
      <Button type="submit"><Search /> Show</Button>
    </form>
  );
}

/** An amount, right-aligned with tabular figures. */
export function Money({ cents, currency, className }: { cents: number; currency: Currency; className?: string }) {
  return <span className={cn("tabular-nums whitespace-nowrap", cents < 0 && "text-destructive", className)}>{formatMoney(cents, currency)}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const tone = status === "void" ? "bg-red-100 text-red-800"
    : status === "draft" ? "bg-slate-100 text-slate-700"
    : status === "approved" ? "bg-amber-100 text-amber-900"
    : "bg-emerald-100 text-emerald-800";
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", tone)}>{status}</span>;
}
