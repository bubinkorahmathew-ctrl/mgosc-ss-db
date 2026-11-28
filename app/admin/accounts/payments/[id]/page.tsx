import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { amountInWords, toCents } from "@/lib/money";
import { getPayment } from "@/lib/repo/accounting/payments";
import { listCategories, listEvents } from "@/lib/repo/accounting/setup";
import { getCurrency } from "@/lib/repo/accounting/shared";
import { blobEnabled } from "@/lib/repo/files";
import { PAYMENT_MODE_LABELS } from "@/lib/validation/accounts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Money, StatusPill } from "@/components/accounts/common";
import { PaymentDialog } from "@/components/accounts/payment-dialog";
import { BillUpload, PaymentStep } from "@/components/accounts/payment-actions";
import { VoidButton } from "@/components/accounts/void-button";

export const metadata: Metadata = { title: "Voucher" };

export default async function PaymentPage({ params }: PageProps<"/admin/accounts/payments/[id]">) {
  const user = await requireRole("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p, currency, categories, events] = await Promise.all([
    getPayment(user, id), getCurrency(user), listCategories(user, { type: "expense" }), listEvents(user),
  ]);
  if (!p) notFound();
  const cents = toCents(p.amount);
  const rows: [string, React.ReactNode][] = [
    ["Date", formatDate(p.paymentDate)],
    ["Paid to", p.paidTo],
    ["Category", p.category],
    ["Event", p.event ?? "-"],
    ["Paid by", `${PAYMENT_MODE_LABELS[p.paymentMode]}${p.referenceNo ? ` · ${p.referenceNo}` : ""}`],
    ["Remarks", p.remarks ?? "-"],
    ["Prepared by", p.requestedByName ?? "-"],
    ["Approved by", p.approvedByName ? `${p.approvedByName}${p.approvedAt ? ` on ${formatDate(p.approvedAt.toISOString())}` : ""}` : "-"],
    ...(p.status === "void" ? [["Void reason", p.voidReason ?? ""] as [string, React.ReactNode]] : []),
  ];

  return (
    <>
      <Link href="/admin/accounts/payments" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Vouchers
      </Link>
      <PageHeader title={p.voucherNo} actions={<StatusPill status={p.status} />} />
      <Card className="mb-4">
        <CardContent className="space-y-4">
          <div>
            <p className="text-2xl font-semibold"><Money cents={cents} currency={currency} /></p>
            <p className="text-sm italic text-muted-foreground">{amountInWords(cents, currency.code)}</p>
          </div>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-sm">{v}</dd></div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {(p.status === "draft" || p.status === "approved") && <PaymentStep id={p.id} status={p.status} />}
        {p.status === "draft" && (
          <PaymentDialog today={todayISO()} categories={categories.map((c) => ({ id: c.id, label: c.name }))}
            events={events.map((e) => ({ id: e.id, label: e.name }))}
            payment={{ id: p.id, voucherNo: p.voucherNo, payment_date: p.paymentDate, paid_to: p.paidTo, category_id: p.categoryId,
              event_id: p.eventId ?? "", amount: p.amount, payment_mode: p.paymentMode, reference_no: p.referenceNo ?? "", remarks: p.remarks ?? "" }} />
        )}
        {p.status !== "void" && (blobEnabled()
          ? <BillUpload id={p.id} hasBill={!!p.billPath} />
          : <span className="self-center text-xs text-muted-foreground">Bills can be attached once file storage (Vercel Blob) is connected.</span>)}
        {p.billPath && (
          <Button variant="outline" nativeButton={false} render={<a href={`/api/accounts/payments/${p.id}/bill`} target="_blank" rel="noopener" />}>
            <ExternalLink /> View bill
          </Button>
        )}
        <Button variant="outline" nativeButton={false} render={<a href={`/api/accounts/payments/${p.id}/pdf`} target="_blank" rel="noopener" />}>
          <FileText /> Voucher PDF
        </Button>
        {p.status !== "void" && <VoidButton kind="payment" id={p.id} no={p.voucherNo} />}
      </div>
    </>
  );
}
