import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { listCategories, listOpeningBalances } from "@/lib/repo/accounting/setup";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { AccountsTabs, Money } from "@/components/accounts/common";
import { AddCategory, CategoryRow, CurrencyForm, OpeningBalanceForm } from "@/components/accounts/settings-forms";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountSettingsPage() {
  const user = await requireRole("admin");
  const [categories, balances, currency] = await Promise.all([
    listCategories(user, { all: true }), listOpeningBalances(user), getCurrency(user),
  ]);
  return (
    <>
      <PageHeader title="Accounting" description="Categories, opening balances and currency." />
      <AccountsTabs active="/admin/accounts/settings" />
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Categories</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {(["income", "expense"] as const).map((type) => (
              <section key={type} aria-labelledby={`cat-${type}`}>
                <h3 id={`cat-${type}`} className="font-medium capitalize">{type}</h3>
                <ul className="divide-y">{categories.filter((c) => c.type === type).map((c) => <CategoryRow key={c.id} category={c} />)}</ul>
              </section>
            ))}
            <p className="text-xs text-muted-foreground">A category in use is never deleted: untick “In use” to hide it from new entries. “Charity collection” is used by the charity grid.</p>
            <AddCategory />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Opening balances</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">The cash book starts from the latest opening balance on or before the first day shown. Saving the same date again replaces it.</p>
            <OpeningBalanceForm today={todayISO()} />
            {balances.length > 0 && (
              <ul className="divide-y">
                {balances.map((b) => (
                  <li key={b.id} className="flex flex-wrap gap-x-4 py-1.5">
                    <span className="font-medium">{formatDate(b.asOnDate)}</span>
                    <span>Cash <Money cents={toCents(b.cash)} currency={currency} /></span>
                    <span>Bank <Money cents={toCents(b.bank)} currency={currency} /></span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {user.superAdmin && (
          <Card>
            <CardHeader><CardTitle>Currency</CardTitle></CardHeader>
            <CardContent><CurrencyForm code={currency.code} symbol={currency.symbol} /></CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
