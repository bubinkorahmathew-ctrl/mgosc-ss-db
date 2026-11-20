"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";
import type { z } from "zod";
import { saveActivity } from "@/actions/teacher";
import { ACTIVITY_LABELS, activitySchema } from "@/lib/validation/teacher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/form/field";

type In = z.input<typeof activitySchema>;
type Out = z.output<typeof activitySchema>;
type Option = { id: string; label: string };

export function ActivityDialog({ classId, students, defaultDate, defaultStudentId, activity }: {
  classId: string; students: Option[]; defaultDate: string; defaultStudentId?: string;
  activity?: { id: string; type: Out["type"]; title: string; activity_date: string; score: number | null; notes: string; student_id: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const defaults: In = activity
    ? { ...activity, class_id: classId, score: activity.score ?? undefined }
    : { class_id: classId, type: "competition", title: "", activity_date: defaultDate, student_id: defaultStudentId ?? "", notes: "" };
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(activitySchema), defaultValues: defaults });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => start(async () => {
    const res = await saveActivity({ ...values, id: activity?.id });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
    setOpen(false);
    if (!activity) form.reset(defaults);
    router.refresh();
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={activity ? <Button variant="ghost" size="icon" aria-label={`Edit ${activity.title}`} /> : <Button />}>
        {activity ? <Pencil /> : <><Plus /> Add activity</>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activity ? "Edit activity" : "Add activity"}</DialogTitle>
          <DialogDescription>For the whole class, or choose one student.</DialogDescription>
        </DialogHeader>
        <form id="activity-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field id="a-type" label="Type" required error={errors.type?.message}>
              <NativeSelect id="a-type" {...form.register("type")}>
                {Object.entries(ACTIVITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </Field>
            <Field id="a-date" label="Date" required error={errors.activity_date?.message}>
              <Input id="a-date" type="date" {...form.register("activity_date")} />
            </Field>
          </div>
          <Field id="a-title" label="Title" required error={errors.title?.message}>
            <Input id="a-title" placeholder="e.g. Bible quiz - 1st prize" {...form.register("title")} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field id="a-student" label="Student" className="col-span-2" error={errors.student_id?.message}>
              <NativeSelect id="a-student" {...form.register("student_id")}>
                <option value="">Whole class</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </NativeSelect>
            </Field>
            <Field id="a-score" label="Score" error={errors.score?.message}>
              <Input id="a-score" type="number" inputMode="decimal" step="any" min={0}
                {...form.register("score", { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) })} />
            </Field>
          </div>
          <Field id="a-notes" label="Notes" error={errors.notes?.message}>
            <Textarea id="a-notes" rows={3} {...form.register("notes")} />
          </Field>
        </form>
        <DialogFooter>
          <Button type="submit" form="activity-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActivityStudentFilter({ students, selectedId }: { students: Option[]; selectedId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (!students.length) return null;
  return (
    <div className="mb-4 flex items-center gap-2">
      <label htmlFor="act-student" className="shrink-0 text-sm font-medium">Show</label>
      <NativeSelect id="act-student" className="sm:w-72" value={selectedId ?? ""} onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("student", e.target.value); else next.delete("student");
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}>
        <option value="">All activities</option>
        {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </NativeSelect>
    </div>
  );
}
