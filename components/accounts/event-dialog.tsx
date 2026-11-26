"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";
import type { z } from "zod";
import { saveEvent } from "@/actions/accounting";
import { eventSchema } from "@/lib/validation/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/form/field";

type In = z.input<typeof eventSchema>;
type Out = z.output<typeof eventSchema>;

export function EventDialog({ event }: { event?: In & { id: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const defaults: In = event ?? { name: "", event_date: "", budget: "", status: "planned", notes: "" };
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(eventSchema), defaultValues: defaults });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => start(async () => {
    const res = await saveEvent({ ...values, id: event?.id });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
    setOpen(false);
    if (!event) {
      form.reset(defaults);
      if (res.data) router.push(`/admin/accounts/events/${res.data.id}`);
    } else router.refresh();
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={event ? <Button variant="outline" size="sm" /> : <Button />}>
        {event ? <><Pencil /> Edit</> : <><Plus /> New event</>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>Receipts and vouchers can be linked to an event to see its budget against actual.</DialogDescription>
        </DialogHeader>
        <form id="event-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <Field id="e-name" label="Name" required error={errors.name?.message}>
            <Input id="e-name" maxLength={120} placeholder="e.g. Annual day 2026" {...form.register("name")} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field id="e-date" label="Date" error={errors.event_date?.message}><Input id="e-date" type="date" {...form.register("event_date")} /></Field>
            <Field id="e-budget" label="Budget" error={errors.budget?.message}>
              <Input id="e-budget" inputMode="decimal" placeholder="0.00" {...form.register("budget")} />
            </Field>
            <Field id="e-status" label="Status">
              <NativeSelect id="e-status" {...form.register("status")}>
                <option value="planned">Planned</option>
                <option value="ongoing">Ongoing</option>
                <option value="closed">Closed</option>
              </NativeSelect>
            </Field>
          </div>
          <Field id="e-notes" label="Notes" error={errors.notes?.message}><Textarea id="e-notes" rows={3} {...form.register("notes")} /></Field>
        </form>
        <DialogFooter>
          <Button type="submit" form="event-form" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
