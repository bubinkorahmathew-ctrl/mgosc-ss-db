import { FileText } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { charityGrid } from "@/lib/repo/accounting/receipts";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { isoDate } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/page-header";
import { Field, NativeSelect } from "@/components/form/field";
import { Money } from "./common";
import { CharityGrid } from "./charity-grid";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Date and class pickers, the grid, and what was already received that day (admins: all; teachers: their own entries). */
export async function CharityPage({ user, sp, classes }: { user: CurrentUser; sp: SP; classes: { id: string; label: string }[] }) {
  const today = todayISO();
  const date = isoDate.safeParse(one(sp.date)).success && one(sp.date) <= today ? one(sp.date) : today;
  const classId = classes.find((c) => c.id === one(sp.class))?.id ?? classes[0]?.id;
  if (!classId) return <EmptyState title="No classes available." />;
  const [grid, currency] = await Promise.all([charityGrid(user, classId, date), getCurrency(user)]);
  const already = grid.already.reduce((s, r) => s + toCents(r.amount), 0);

  return (
    <div className="space-y-4">
      <form method="get" className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3 sm:items-end">
        <Field id="c-date" label="Date"><Input id="c-date" name="date" type="date" max={today} defaultValue={date} /></Field>
        <Field id="c-class" label="Class">
          <NativeSelect id="c-class" name="class" defaultValue={classId}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </NativeSelect>
        </Field>
        <Button type="submit">Show</Button>
      </form>

      {grid.already.length > 0 && (
        <details className="rounded-xl border p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Already received on {formatDate(date)} for {grid.className}: {grid.already.length} receipt{grid.already.length === 1 ? "" : "s"}, <Money cents={already} currency={currency} />
          </summary>
          <ul className="mt-2 divide-y">
            {grid.already.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-1.5">
                <span className="font-mono text-xs">{r.receiptNo}</span>
                <span className="flex-1">{r.name}</span>
                <Money cents={toCents(r.amount)} currency={currency} />
                <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`/api/accounts/receipts/${r.id}/pdf`} target="_blank" rel="noopener" />}>
                  <FileText /> PDF
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <CharityGrid key={`${classId}:${date}`} classId={classId} date={date} currency={currency}
        students={grid.students} teachers={grid.teachers} />
    </div>
  );
}
