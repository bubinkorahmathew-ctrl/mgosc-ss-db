"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { approveRegistration, rejectRegistration } from "@/actions/registration";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/form/field";

export function ReviewPanel({ registrationId, classes }: {
  registrationId: string; classes: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [classId, setClassId] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [pending, start] = useTransition();

  const approve = () => start(async () => {
    if (!classId) { toast.error("Choose a class first."); return; }
    const res = await approveRegistration({ registration_id: registrationId, class_id: classId });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Approved. Student record created.");
    router.push(`/admin/students/${res.data!.studentId}`);
  });

  const reject = () => start(async () => {
    const res = await rejectRegistration({ registration_id: registrationId, review_note: note });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Registration rejected.");
    router.push("/admin/registrations");
  });

  if (mode === "reject") {
    return (
      <div className="space-y-4">
        <Field id="note" label="Reason (optional)" hint="Kept for your records.">
          <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex flex-col gap-2">
          <Button variant="destructive" onClick={reject} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <X />} Reject registration
          </Button>
          <Button variant="ghost" onClick={() => setMode("approve")} disabled={pending}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          There are no classes in the current academic year. Create one under Classes first.
        </p>
      ) : (
        <Field id="class" label="Sunday School class" required
          hint="The next admission number is generated automatically.">
          <NativeSelect id="class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select a class…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </NativeSelect>
        </Field>
      )}
      <div className="flex flex-col gap-2">
        <Button onClick={approve} disabled={pending || !classes.length}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve &amp; create student
        </Button>
        <Button variant="outline" onClick={() => setMode("reject")} disabled={pending}>Reject…</Button>
      </div>
    </div>
  );
}
