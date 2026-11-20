"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { deleteClass, saveAcademicYear, saveClass, setCurrentAcademicYear } from "@/actions/classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckboxField, Field, NativeSelect } from "@/components/form/field";

type Option = { id: string; label: string };

export function ClassDialog({ yearId, teachers, cls }: {
  yearId: string; teachers: Option[];
  cls?: { id: string; name: string; section: string; teacher_ids: string[] };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(cls?.name ?? "");
  const [section, setSection] = useState(cls?.section ?? "");
  const [teacherIds, setTeacherIds] = useState<string[]>(cls?.teacher_ids ?? []);
  const [errors, setErrors] = useState<Record<string, string[]>>();

  const toggle = (id: string) =>
    setTeacherIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = () => start(async () => {
    const res = await saveClass({ id: cls?.id, name, section, academic_year_id: yearId, teacher_ids: teacherIds });
    if (!res.ok) { setErrors(res.fieldErrors); toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
    setOpen(false);
    if (!cls) { setName(""); setSection(""); setTeacherIds([]); }
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={cls ? <Button variant="outline" size="sm" /> : <Button />}>
        {cls ? <><Pencil /> Edit</> : <><Plus /> New class</>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cls ? "Edit class" : "New class"}</DialogTitle>
          <DialogDescription>Assign one or more teachers. Teachers only see their own classes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field id="cls-name" label="Class name" required error={errors?.name?.[0]} className="col-span-2">
              <Input id="cls-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Class 1" />
            </Field>
            <Field id="cls-section" label="Section" error={errors?.section?.[0]}>
              <Input id="cls-section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="A" />
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Teachers</legend>
            {teachers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active teachers yet. Add teachers first.</p>
            ) : (
              <div className="grid max-h-60 gap-2 overflow-y-auto">
                {teachers.map((t) => (
                  <CheckboxField key={t.id} id={`t-${t.id}`} label={t.label}
                    checked={teacherIds.includes(t.id)} onChange={() => toggle(t.id)} />
                ))}
              </div>
            )}
          </fieldset>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteClassButton({ classId, name }: { classId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Delete ${name}`} />}>
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Only empty classes (no students, exams or attendance) can be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={() => start(async () => {
            const res = await deleteClass(classId);
            if (!res.ok) { toast.error(res.error); return; }
            toast.success(res.message ?? "Deleted.");
            router.refresh();
          })}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AcademicYearBar({ years, selectedId }: {
  years: { id: string; name: string; is_current: boolean; range: string }[]; selectedId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const selected = years.find((y) => y.id === selectedId);

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-end">
      {years.length > 0 && (
        <Field id="year" label="Academic year" className="sm:w-64">
          <NativeSelect id="year" value={selectedId ?? ""}
            onChange={(e) => router.replace(`${pathname}?year=${e.target.value}`)}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (current)" : ""}</option>)}
          </NativeSelect>
        </Field>
      )}
      {selected && <p className="text-sm text-muted-foreground sm:pb-2">{selected.range}</p>}
      <div className="flex flex-wrap gap-2 sm:ml-auto">
        {selected && !selected.is_current && (
          <Button variant="outline" disabled={pending} onClick={() => start(async () => {
            const res = await setCurrentAcademicYear(selected.id);
            if (!res.ok) { toast.error(res.error); return; }
            toast.success(res.message ?? "Done.");
            router.refresh();
          })}>
            {pending ? <Loader2 className="animate-spin" /> : <Star />} Make current
          </Button>
        )}
        <YearDialog isFirst={years.length === 0} />
      </div>
    </div>
  );
}

function YearDialog({ isFirst }: { isFirst: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(isFirst);
  const [errors, setErrors] = useState<Record<string, string[]>>();

  const save = () => start(async () => {
    const res = await saveAcademicYear({ name, start_date: startDate, end_date: endDate, is_current: makeCurrent });
    if (!res.ok) { setErrors(res.fieldErrors); toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
    setOpen(false);
    router.replace(`${pathname}?year=${res.data!.id}`);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={isFirst ? "default" : "outline"} />}>
        <CalendarPlus /> New academic year
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New academic year</DialogTitle>
          <DialogDescription>For example 2027-28, from June to March.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="y-name" label="Name" required error={errors?.name?.[0]}>
            <Input id="y-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="2027-28" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="y-start" label="Start date" required error={errors?.start_date?.[0]}>
              <Input id="y-start" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field id="y-end" label="End date" required error={errors?.end_date?.[0]}>
              <Input id="y-end" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <CheckboxField id="y-current" label="Make this the current year" checked={makeCurrent}
            onChange={(e) => setMakeCurrent(e.target.checked)} />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !name || !startDate || !endDate}>
            {pending && <Loader2 className="animate-spin" />} Create year
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
