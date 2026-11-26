import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { listReceipts } from "@/lib/repo/accounting/receipts";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { getTeacherClassContext } from "@/lib/repo/teacher-context";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Money, StatusPill } from "@/components/accounts/common";
import { CharityPage } from "@/components/accounts/charity-page";

export const metadata: Metadata = { title: "Charity" };

/** Teachers: charity for their own class's students and themselves; they see only what they entered. */
export default async function TeacherCharityPage({ searchParams }: PageProps<"/teacher/charity">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(user, sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;
  const [mine, currency] = await Promise.all([listReceipts(user, {}, 30), getCurrency(user)]);
  const current = classes.filter((c) => c.isCurrent);

  return (
    <>
      <PageHeader title="Charity collection" description="Enter what each student gave. Blank means nothing given." />
      <CharityPage user={user} sp={{ ...sp, class: typeof sp.class === "string" ? sp.class : selected.id }}
        classes={(current.length ? current : classes).map((c) => ({ id: c.id, label: c.label }))} />

      <section aria-labelledby="my-entries" className="mt-8">
        <h2 id="my-entries" className="mb-2 font-semibold">Your recent entries</h2>
        {!mine.length ? <EmptyState title="Nothing entered yet." /> : (
          <ul className="divide-y rounded-xl border text-sm">
            {mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className="font-mono text-xs">{r.receiptNo}</span>
                <span className="min-w-0 flex-1">{r.name} <span className="text-muted-foreground">· {formatDate(r.receiptDate)}</span></span>
                <Money cents={toCents(r.amount)} currency={currency} className={r.status === "void" ? "line-through text-muted-foreground" : ""} />
                {r.status === "void" && <StatusPill status="void" />}
                <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`/api/accounts/receipts/${r.id}/pdf`} target="_blank" rel="noopener" />}>
                  <FileText /> PDF
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
