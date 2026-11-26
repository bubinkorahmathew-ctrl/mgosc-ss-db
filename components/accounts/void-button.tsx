"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";
import { setPaymentStatus, voidReceipt } from "@/actions/accounting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/form/field";

/** Void a receipt or voucher: it stays in the books, marked void, with the reason. */
export function VoidButton({ kind, id, no }: { kind: "receipt" | "payment"; id: string; no: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const res = kind === "receipt" ? await voidReceipt({ id, reason }) : await setPaymentStatus({ id, action: "void", reason });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Voided.");
    setOpen(false);
    router.refresh();
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Void ${no}`} />}>
        <Ban /> Void
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void {no}?</DialogTitle>
          <DialogDescription>It is not deleted: it stays in the books, marked void, and leaves every total. This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <Field id={`void-${id}`} label="Reason" required>
          <Input id={`void-${id}`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. entered twice" />
        </Field>
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={pending || !reason.trim()}>
            {pending && <Loader2 className="animate-spin" />} Void
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
