"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, Banknote, Loader2, Upload } from "lucide-react";
import { setPaymentStatus } from "@/actions/accounting";
import { Button } from "@/components/ui/button";

/** Approve (draft) or mark paid (approved). */
export function PaymentStep({ id, status }: { id: string; status: "draft" | "approved" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const action = status === "draft" ? "approve" : "pay";
  const run = () => start(async () => {
    const res = await setPaymentStatus({ id, action });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Done.");
    router.refresh();
  });
  return (
    <Button onClick={run} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : action === "approve" ? <BadgeCheck /> : <Banknote />}
      {action === "approve" ? "Approve" : "Mark paid"}
    </Button>
  );
}

/** Attach or replace the bill: a photo (JPG/PNG) or PDF up to 5 MB. */
export function BillUpload({ id, hasBill }: { id: string; hasBill: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    if (file.size > 5_000_000) { toast.error("The bill must be smaller than 5 MB."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/payments/${id}/bill`, { method: "POST", body: file });
      const text = await res.text();
      if (!res.ok) { toast.error(text || "Could not attach the bill."); return; }
      toast.success(text);
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <input ref={input} type="file" accept="image/png,image/jpeg,application/pdf" capture="environment" className="sr-only"
        aria-label="Bill photo or PDF" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />} {hasBill ? "Replace bill" : "Attach bill"}
      </Button>
    </>
  );
}
