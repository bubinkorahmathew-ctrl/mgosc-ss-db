"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import type { z } from "zod";
import { createReceipt } from "@/actions/accounting";
import { PAYMENT_MODE_LABELS, PAYMENT_MODES, receiptSchema } from "@/lib/validation/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/form/field";
import { SearchPick } from "./search-pick";

type In = z.input<typeof receiptSchema>;
type Out = z.output<typeof receiptSchema>;
type Option = { id: string; label: string };

export function ReceiptDialog({ students, teachers, categories, events, today, label = "New receipt", defaultCategory }: {
  students: Option[]; teachers: Option[]; categories: Option[]; events: Option[]; today: string; label?: string; defaultCategory?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const defaults: In = {
    receipt_date: today, received_from_type: "student", student_id: "", teacher_id: "", received_from_name: "",
    category_id: defaultCategory ?? categories[0]?.id ?? "", event_id: "", amount: "", payment_mode: "cash", reference_no: "", remarks: "",
  };
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(receiptSchema), defaultValues: defaults });
  const { errors } = form.formState;
  const type = useWatch({ control: form.control, name: "received_from_type" });

  const onSubmit = form.handleSubmit((values) => start(async () => {
    const res = await createReceipt(values);
    if (!res.ok) {
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof In, { message: v[0] });
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Saved.", res.data ? {
      action: { label: "Print", onClick: () => window.open(`/api/accounts/receipts/${res.data!.id}/pdf`, "_blank", "noopener") },
    } : undefined);
    setOpen(false);
    form.reset(defaults);
    router.refresh();
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus /> {label}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>The receipt number is given when you save. A saved receipt can only be voided, not edited.</DialogDescription>
        </DialogHeader>
        <form id="receipt-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field id="r-date" label="Date" required error={errors.receipt_date?.message}>
              <Input id="r-date" type="date" max={today} {...form.register("receipt_date")} />
            </Field>
            <Field id="r-from" label="Received from" required>
              <NativeSelect id="r-from" {...form.register("received_from_type")}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="other">Someone else</option>
              </NativeSelect>
            </Field>
          </div>
          {type === "student" && (
            <Field id="r-student" label="Student" required hint="Type part of the name or admission number" error={errors.student_id?.message}>
              <Controller control={form.control} name="student_id" render={({ field }) => (
                <SearchPick id="r-student" options={students} value={field.value ?? ""} onChange={field.onChange} invalid={!!errors.student_id} />
              )} />
            </Field>
          )}
          {type === "teacher" && (
            <Field id="r-teacher" label="Teacher" required error={errors.teacher_id?.message}>
              <Controller control={form.control} name="teacher_id" render={({ field }) => (
                <SearchPick id="r-teacher" options={teachers} value={field.value ?? ""} onChange={field.onChange} invalid={!!errors.teacher_id} />
              )} />
            </Field>
          )}
          {type === "other" && (
            <Field id="r-name" label="Name" required error={errors.received_from_name?.message}>
              <Input id="r-name" maxLength={120} {...form.register("received_from_name")} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field id="r-cat" label="Category" required error={errors.category_id?.message}>
              <NativeSelect id="r-cat" {...form.register("category_id")}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </NativeSelect>
            </Field>
            <Field id="r-event" label="Event" error={errors.event_id?.message}>
              <NativeSelect id="r-event" {...form.register("event_id")}>
                <option value="">None</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="r-amount" label="Amount" required error={errors.amount?.message}>
              <Input id="r-amount" inputMode="decimal" placeholder="0.00" {...form.register("amount")} />
            </Field>
            <Field id="r-mode" label="Paid by" required>
              <NativeSelect id="r-mode" {...form.register("payment_mode")}>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field id="r-ref" label="Reference no." hint="Bank or online transaction number" error={errors.reference_no?.message}>
            <Input id="r-ref" maxLength={60} {...form.register("reference_no")} />
          </Field>
          <Field id="r-remarks" label="Remarks" error={errors.remarks?.message}>
            <Input id="r-remarks" maxLength={300} {...form.register("remarks")} />
          </Field>
        </form>
        <DialogFooter>
          <Button type="submit" form="receipt-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Save receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
