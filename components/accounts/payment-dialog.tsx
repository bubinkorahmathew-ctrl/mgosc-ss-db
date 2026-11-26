"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";
import type { z } from "zod";
import { savePayment } from "@/actions/accounting";
import { PAYMENT_MODE_LABELS, PAYMENT_MODES, paymentSchema } from "@/lib/validation/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/form/field";

type In = z.input<typeof paymentSchema>;
type Out = z.output<typeof paymentSchema>;
type Option = { id: string; label: string };

/** New voucher (saved as a draft), or edit a draft. */
export function PaymentDialog({ categories, events, today, payment, defaultEvent }: {
  categories: Option[]; events: Option[]; today: string; defaultEvent?: string;
  payment?: In & { id: string; voucherNo: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const defaults: In = payment ?? {
    payment_date: today, paid_to: "", category_id: categories[0]?.id ?? "", event_id: defaultEvent ?? "", amount: "",
    payment_mode: "cash", reference_no: "", remarks: "",
  };
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(paymentSchema), defaultValues: defaults });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => start(async () => {
    const res = await savePayment({ ...values, id: payment?.id });
    if (!res.ok) {
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof In, { message: v[0] });
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Saved.");
    setOpen(false);
    if (!payment) {
      form.reset(defaults);
      if (res.data) router.push(`/admin/accounts/payments/${res.data.id}`);
    } else router.refresh();
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={payment ? <Button variant="outline" size="sm" /> : <Button />}>
        {payment ? <><Pencil /> Edit</> : <><Plus /> New voucher</>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{payment ? `Edit ${payment.voucherNo}` : "New payment voucher"}</DialogTitle>
          <DialogDescription>Saved as a draft. Then attach the bill, approve, and mark it paid. Only paid vouchers reach the cash book.</DialogDescription>
        </DialogHeader>
        <form id="payment-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field id="p-date" label="Date" required error={errors.payment_date?.message}>
              <Input id="p-date" type="date" max={today} {...form.register("payment_date")} />
            </Field>
            <Field id="p-amount" label="Amount" required error={errors.amount?.message}>
              <Input id="p-amount" inputMode="decimal" placeholder="0.00" {...form.register("amount")} />
            </Field>
          </div>
          <Field id="p-to" label="Paid to" required error={errors.paid_to?.message}>
            <Input id="p-to" maxLength={120} placeholder="Shop or person" {...form.register("paid_to")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="p-cat" label="Category" required error={errors.category_id?.message}>
              <NativeSelect id="p-cat" {...form.register("category_id")}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </NativeSelect>
            </Field>
            <Field id="p-event" label="Event">
              <NativeSelect id="p-event" {...form.register("event_id")}>
                <option value="">None</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="p-mode" label="Paid by" required>
              <NativeSelect id="p-mode" {...form.register("payment_mode")}>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>)}
              </NativeSelect>
            </Field>
            <Field id="p-ref" label="Reference no." error={errors.reference_no?.message}>
              <Input id="p-ref" maxLength={60} {...form.register("reference_no")} />
            </Field>
          </div>
          <Field id="p-remarks" label="Remarks" error={errors.remarks?.message}>
            <Input id="p-remarks" maxLength={300} {...form.register("remarks")} />
          </Field>
        </form>
        <DialogFooter>
          <Button type="submit" form="payment-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {payment ? "Save" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
