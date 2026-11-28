import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { getClassOptions } from "@/lib/repo/classes";
import { payerOptions } from "@/lib/repo/accounting/receipts";
import { listCategories, listEvents } from "@/lib/repo/accounting/setup";
import { PageHeader } from "@/components/page-header";
import { AccountsTabs } from "@/components/accounts/common";
import { CharityPage } from "@/components/accounts/charity-page";
import { ReceiptDialog } from "@/components/accounts/receipt-dialog";

export const metadata: Metadata = { title: "Charity collection" };

export default async function AdminCharityPage({ searchParams }: PageProps<"/admin/accounts/charity">) {
  const user = await requireRole("admin");
  const sp = await searchParams;
  const [classes, payers, categories, events] = await Promise.all([
    getClassOptions(user, { currentOnly: true }), payerOptions(user), listCategories(user, { type: "income" }), listEvents(user),
  ]);
  const charity = categories.find((c) => c.name === "Charity collection");
  return (
    <>
      <PageHeader title="Accounting" description="Charity collection: one amount per student; blank means nothing given."
        actions={<ReceiptDialog label="Quick entry" students={payers.students} teachers={payers.teachers} today={todayISO()}
          categories={categories.map((c) => ({ id: c.id, label: c.name }))} defaultCategory={charity?.id}
          events={events.filter((e) => e.status !== "closed").map((e) => ({ id: e.id, label: e.name }))} />} />
      <AccountsTabs active="/admin/accounts/charity" />
      <CharityPage user={user} sp={sp} classes={classes.map((c) => ({ id: c.id, label: c.label }))} />
    </>
  );
}
