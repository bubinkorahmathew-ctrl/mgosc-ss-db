"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, Loader2 } from "lucide-react";
import { promoteStudents } from "@/actions/promotion";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, NativeSelect } from "@/components/form/field";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function PromotionForm({ fromId, fromLabel, students, targets, hasLaterYear }: {
  fromId: string; fromLabel: string;
  students: { id: string; name: string; admissionNo: string }[];
  targets: { value: string; label: string }[];
  hasLaterYear: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ticked, setTicked] = useState<string[]>(students.map((s) => s.id));
  const [target, setTarget] = useState(targets[0]?.value ?? "passed_out");
  const toggle = (id: string) => setTicked((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const targetLabel = target === "passed_out" ? "Passed out (leaves Sunday School)" : targets.find((t) => t.value === target)?.label;
  const held = students.length - ticked.length;

  const go = () => start(async () => {
    const res = await promoteStudents({ from_class_id: fromId, target, student_ids: ticked });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Done.");
    router.refresh();
  });

  return (
    <div className="space-y-4">
      {!hasLaterYear && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          There are no classes in a later academic year yet. Create next year and its classes on the Classes page first.
        </p>
      )}
      <Field id="pr-to" label="Move ticked students to" className="sm:w-80">
        <NativeSelect id="pr-to" value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          <option value="passed_out">Passed out (leaves Sunday School)</option>
        </NativeSelect>
      </Field>

      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium">
          <span>{ticked.length} to move{held ? ` · ${held} held back` : ""}</span>
          <button type="button" className="text-xs text-primary underline"
            onClick={() => setTicked(ticked.length === students.length ? [] : students.map((s) => s.id))}>
            {ticked.length === students.length ? "Untick all" : "Tick all"}
          </button>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => (
            <CheckboxField key={s.id} id={`pr-${s.id}`} checked={ticked.includes(s.id)} onChange={() => toggle(s.id)}
              label={<>{s.name} <span className="text-xs text-muted-foreground">{s.admissionNo}</span>{!ticked.includes(s.id) && <span className="ml-1 text-xs font-medium text-amber-700">held back</span>}</>} />
          ))}
        </div>
      </fieldset>

      <AlertDialog>
        <AlertDialogTrigger render={<Button size="lg" disabled={pending || !ticked.length} />}>
          {pending ? <Loader2 className="animate-spin" /> : <GraduationCap />} Move {ticked.length} student{ticked.length === 1 ? "" : "s"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {ticked.length} student{ticked.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              From <b>{fromLabel}</b> to <b>{targetLabel}</b>.{held ? ` ${held} held-back student${held === 1 ? "" : "s"} will stay.` : ""}{" "}
              Their past marks, attendance and certificates are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={go}>Move</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
