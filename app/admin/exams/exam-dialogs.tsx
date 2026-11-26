"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { createExams, deleteExam, deleteSubject, saveSubject, updateExam } from "@/actions/exams";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckboxField, Field } from "@/components/form/field";

type Errors = Record<string, string[]> | undefined;

/** Run an action, toast the outcome, refresh on success. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: () => void, onErr?: (e: Errors) => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) { onErr?.(res.fieldErrors); toast.error(res.error); return; }
      toast.success(res.message ?? "Saved.");
      onOk?.();
      router.refresh();
    });
  return { pending, run };
}

export function SubjectDialog({ subject, nextOrder = 0 }: {
  subject?: { id: string; name: string; max_marks: number; pass_percent: number; sort_order: number }; nextOrder?: number;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(subject?.name ?? "");
  const [max, setMax] = useState(String(subject?.max_marks ?? 50));
  const [pass, setPass] = useState(String(subject?.pass_percent ?? 40));
  const [order, setOrder] = useState(String(subject?.sort_order ?? nextOrder));
  const [errors, setErrors] = useState<Errors>();
  const { pending, run } = useRun();
  const passMarks = Number(max) > 0 && pass !== "" ? Math.round(Number(max) * Number(pass)) / 100 : null;

  const save = () => run(
    () => saveSubject({ id: subject?.id, name, max_marks: Number(max), pass_percent: Number(pass), sort_order: Number(order) || 0 }),
    () => { setOpen(false); if (!subject) { setName(""); setOrder(String(Number(order) + 1)); } },
    setErrors,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={subject ? <Button variant="ghost" size="sm" aria-label={`Edit ${subject.name}`} /> : <Button size="sm" />}>
        {subject ? <Pencil /> : <><Plus /> Add subject</>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{subject ? "Edit subject" : "Add subject"}</DialogTitle>
          <DialogDescription>The maximum marks apply to every exam.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="sub-name" label="Subject name" required error={errors?.name?.[0]}>
            <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Old Testament" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field id="sub-max" label="Maximum marks" required error={errors?.max_marks?.[0]}>
              <Input id="sub-max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
            </Field>
            <Field id="sub-pass" label="Pass %" required error={errors?.pass_percent?.[0]}
              hint={passMarks !== null && !Number.isNaN(passMarks) ? `= ${passMarks} marks` : undefined}>
              <Input id="sub-pass" inputMode="decimal" value={pass} onChange={(e) => setPass(e.target.value)} />
            </Field>
            <Field id="sub-order" label="Order" hint="Lower comes first" error={errors?.sort_order?.[0]}>
              <Input id="sub-order" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !name.trim() || !max || pass === ""}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDelete({ title, description, onConfirm, pending, label }: {
  title: string; description: React.ReactNode; onConfirm: () => void; pending: boolean; label: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" aria-label={label} />}><Trash2 /></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteSubjectButton({ id, name }: { id: string; name: string }) {
  const { pending, run } = useRun();
  return (
    <ConfirmDelete title={`Delete ${name}?`} label={`Delete ${name}`} pending={pending}
      description="Subjects that already have marks cannot be deleted." onConfirm={() => run(() => deleteSubject(id))} />
  );
}

export function DeleteExamButton({ id, name, marks }: { id: string; name: string; marks: number }) {
  const { pending, run } = useRun();
  return (
    <ConfirmDelete title={`Delete ${name}?`} label={`Delete ${name}`} pending={pending}
      description={marks
        ? <span className="font-medium text-destructive">{marks} marks already entered for this exam will be deleted permanently.</span>
        : "No marks have been entered for this exam yet."}
      onConfirm={() => run(() => deleteExam(id))} />
  );
}

export function CreateExamDialog({ yearId, yearName, classes }: {
  yearId: string; yearName: string; classes: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [ids, setIds] = useState<string[]>(classes.map((c) => c.id));
  const [errors, setErrors] = useState<Errors>();
  const { pending, run } = useRun();
  const toggle = (id: string) => setIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const save = () => run(
    () => createExams({ name, exam_date: date, academic_year_id: yearId, class_ids: ids }),
    () => { setOpen(false); setName(""); setDate(""); },
    setErrors,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus /> New exam</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New exam · {yearName}</DialogTitle>
          <DialogDescription>One exam is created for each ticked class.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="ex-name" label="Exam name" required error={errors?.name?.[0]} className="sm:col-span-2">
              <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Annual Exam" />
            </Field>
            <Field id="ex-date" label="Date" error={errors?.exam_date?.[0]}>
              <Input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium">
              Classes
              <button type="button" className="text-xs text-primary underline"
                onClick={() => setIds(ids.length === classes.length ? [] : classes.map((c) => c.id))}>
                {ids.length === classes.length ? "Untick all" : "Tick all"}
              </button>
            </legend>
            <div className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">
              {classes.map((c) => (
                <CheckboxField key={c.id} id={`ex-c-${c.id}`} label={c.label} checked={ids.includes(c.id)} onChange={() => toggle(c.id)} />
              ))}
            </div>
            {errors?.class_ids?.[0] && <p className="text-sm text-destructive">{errors.class_ids[0]}</p>}
          </fieldset>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !name.trim() || !ids.length}>
            {pending && <Loader2 className="animate-spin" />} Create for {ids.length} class{ids.length === 1 ? "" : "es"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditExamDialog({ exam }: { exam: { id: string; name: string; exam_date: string; weight: number } }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(exam.name);
  const [date, setDate] = useState(exam.exam_date);
  const [weight, setWeight] = useState(String(exam.weight));
  const [errors, setErrors] = useState<Errors>();
  const { pending, run } = useRun();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Edit ${exam.name}`} />}><Pencil /></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit exam</DialogTitle>
          <DialogDescription>Changes this class&apos;s exam only.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id={`ee-name-${exam.id}`} label="Exam name" required error={errors?.name?.[0]} className="sm:col-span-2">
            <Input id={`ee-name-${exam.id}`} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id={`ee-date-${exam.id}`} label="Date" error={errors?.exam_date?.[0]}>
            <Input id={`ee-date-${exam.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id={`ee-w-${exam.id}`} label="Weight in the annual result" error={errors?.weight?.[0]} className="sm:col-span-3"
            hint="1 = counts the same as every other exam. 2 = counts twice as much. 0 = left out.">
            <Input id={`ee-w-${exam.id}`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-28" />
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={pending || !name.trim() || weight === ""}
            onClick={() => run(() => updateExam({ id: exam.id, name, exam_date: date, weight: Number(weight) }), () => setOpen(false), setErrors)}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
