import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { charityByClassAndMonth, contributions, totalsByCategory, voidedEntries } from "@/lib/repo/accounting/books";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { formatDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { toQuery } from "@/lib/validation/reports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { AccountsTabs, Money, PeriodForm, periodFrom } from "@/components/accounts/common";

export const metadata: Metadata = { title: "Account reports" };

function Exports({ report, from, to }: { report: string; from: string; to: string }) {
  return (
    <span className="flex gap-1">
      <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/${report}?${toQuery({ from, to })}`} />}><Download /> Excel</Button>
      <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`/api/accounts/export/${report}?${toQuery({ from, to, format: "pdf" })}`} target="_blank" rel="noopener" />}><FileText /> PDF</Button>
    </span>
  );
}

export default async function AccountReportsPage({ searchParams }: PageProps<"/admin/accounts/reports">) {
  const user = await requireRole("admin");
  const { from, to } = periodFrom(await searchParams, "year");
  const [currency, income, expense, charity, students, teachers, voided] = await Promise.all([
    getCurrency(user), totalsByCategory(user, "income", from, to), totalsByCategory(user, "expense", from, to),
    charityByClassAndMonth(user, from, to), contributions(user, "student", from, to), contributions(user, "teacher", from, to),
    voidedEntries(user, from, to),
  ]);
  const months = [...new Set(charity.map((c) => c.month))].sort();
  const classNames = [...new Set(charity.map((c) => c.className))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const cell = (cls: string, m: string) => charity.find((c) => c.className === cls && c.month === m)?.totalCents ?? 0;

  const section = (title: string, report: string, body: React.ReactNode) => (
    <Card>
      <CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2">{title}<Exports report={report} from={from} to={to} /></CardTitle></CardHeader>
      <CardContent className="text-sm">{body}</CardContent>
    </Card>
  );
  const byCategory = (rows: typeof income) => !rows.length ? <p className="text-muted-foreground">Nothing in this period.</p> : (
    <ul className="divide-y">
      {rows.map((r) => <li key={r.category} className="flex justify-between py-1.5"><span>{r.category} <span className="text-muted-foreground">({r.count})</span></span><Money cents={r.totalCents} currency={currency} /></li>)}
      <li className="flex justify-between py-1.5 font-semibold"><span>Total</span><Money cents={rows.reduce((s, r) => s + r.totalCents, 0)} currency={currency} /></li>
    </ul>
  );
  const people = (rows: typeof students, withClass: boolean) => !rows.length ? <p className="text-muted-foreground">Nothing in this period.</p> : (
    <ul className="max-h-80 divide-y overflow-y-auto">
      {rows.map((r) => <li key={r.id} className="flex justify-between gap-2 py-1.5"><span>{r.name}{withClass && r.className && <span className="text-muted-foreground"> · {r.className}</span>}</span><Money cents={r.totalCents} currency={currency} /></li>)}
    </ul>
  );

  return (
    <>
      <PageHeader title="Accounting" description={`Reports for ${formatDate(from)} to ${formatDate(to)}. Each can be downloaded as Excel or PDF.`} />
      <AccountsTabs active="/admin/accounts/reports" />
      <PeriodForm from={from} to={to}>
        <div className="flex items-end gap-1 lg:col-span-2">
          <span className="text-sm text-muted-foreground">Cash book: </span>
          <Exports report="cash-book" from={from} to={to} />
        </div>
      </PeriodForm>
      <div className="grid gap-4 lg:grid-cols-2">
        {section("Income by category", "income", byCategory(income))}
        {section("Expense by category", "expense", byCategory(expense))}
        {section("Charity by class and month", "charity", !charity.length ? <p className="text-muted-foreground">No charity in this period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th scope="col" className="py-1 text-left font-medium">Class</th>{months.map((m) => <th key={m} scope="col" className="py-1 text-right font-medium">{m}</th>)}</tr></thead>
              <tbody className="divide-y">
                {classNames.map((c) => (
                  <tr key={c}><td className="py-1.5">{c}</td>{months.map((m) => <td key={m} className="py-1.5 text-right"><Money cents={cell(c, m)} currency={currency} /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {section("Voided entries", "voided", !voided.length ? <p className="text-muted-foreground">None.</p> : (
          <ul className="divide-y">
            {voided.map((v) => <li key={v.no} className="py-1.5"><span className="font-mono text-xs">{v.no}</span> {v.party} · <Money cents={toCents(v.amount)} currency={currency} /> <span className="text-muted-foreground">· {v.reason}</span></li>)}
          </ul>
        ))}
        {section("Student-wise contributions", "students", people(students, true))}
        {section("Teacher-wise contributions", "teachers", people(teachers, false))}
      </div>
    </>
  );
}
