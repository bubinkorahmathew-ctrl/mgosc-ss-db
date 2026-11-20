"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Award, FileDown, Loader2, RotateCcw } from "lucide-react";
import { issueCertificates } from "@/actions/certificates";
import {
  CERT_LABELS, CERTIFICATE_TYPES, DEFAULT_TITLES, PLACEHOLDER_HELP, PLACEHOLDERS, fillTemplate,
} from "@/lib/certificates";
import type { CertificateType } from "@/lib/supabase/types";
import { todayISO } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxField, Field, NativeSelect } from "@/components/form/field";

type Opt = { id: string; label: string };

export function IssueForm({ classes, classId, className, yearName, students, exams, activities, wording, listHref }: {
  classes: Opt[]; classId: string; className: string; yearName: string;
  students: { id: string; name: string; admissionNo: string }[];
  exams: (Opt & { title: string })[]; activities: (Opt & { title: string })[];
  wording: Partial<Record<CertificateType, string>>;
  listHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [type, setType] = useState<CertificateType>("completion");
  const [title, setTitle] = useState(DEFAULT_TITLES.completion);
  const [template, setTemplate] = useState(wording.completion ?? "");
  const [examId, setExamId] = useState(exams[0]?.id ?? "");
  const [activityId, setActivityId] = useState(activities[0]?.id ?? "");
  const [issuedOn, setIssuedOn] = useState(todayISO());
  const [selected, setSelected] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>();
  const [issued, setIssued] = useState<string[] | null>(null);

  const changeType = (t: CertificateType) => {
    setType(t);
    setTitle(DEFAULT_TITLES[t]);
    setTemplate(wording[t] ?? "");
    setErrors(undefined);
  };
  const toggle = (id: string) => setSelected((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const needsExam = type === "merit";
  const needsActivity = type === "participation";
  const examText = needsExam ? exams.find((e) => e.id === examId)?.title
    : needsActivity ? activities.find((a) => a.id === activityId)?.title : undefined;
  const first = students.find((s) => s.id === selected[0]) ?? students[0];
  const preview = useMemo(() => fillTemplate(template, {
    student_name: first?.name ?? "Student name", class: className, year: yearName,
    exam: examText, rank: needsExam ? "(rank)" : undefined,
  }), [template, first, className, yearName, examText, needsExam]);

  const submit = () => start(async () => {
    const res = await issueCertificates({
      type, class_id: classId, student_ids: selected, title, template, issued_on: issuedOn,
      exam_id: needsExam ? examId : null, activity_id: needsActivity ? activityId : null,
    });
    if (!res.ok) { setErrors(res.fieldErrors); toast.error(res.error); return; }
    toast.success(res.message ?? "Issued.");
    setIssued(res.data!.ids);
    setSelected([]);
    router.refresh();
  });

  if (issued) {
    return (
      <div className="space-y-4 rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-center">
        <Award className="mx-auto size-10 text-emerald-700" />
        <p className="text-lg font-semibold text-emerald-950">{issued.length} certificate{issued.length === 1 ? "" : "s"} issued</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="lg" nativeButton={false}
            render={<a href={`/api/pdf/certificates?ids=${issued.join(",")}`} target="_blank" rel="noopener" />}>
            <FileDown /> Open PDF
          </Button>
          <Button size="lg" variant="outline" onClick={() => setIssued(null)}><RotateCcw /> Issue more</Button>
          <Button size="lg" variant="ghost" render={<Link href={listHref} />} nativeButton={false}>All certificates</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ci-class" label="Class">
            <NativeSelect id="ci-class" value={classId}
              onChange={(e) => router.replace(`${pathname}?class=${e.target.value}`)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </NativeSelect>
          </Field>
          <Field id="ci-type" label="Certificate type">
            <NativeSelect id="ci-type" value={type} onChange={(e) => changeType(e.target.value as CertificateType)}>
              {CERTIFICATE_TYPES.map((t) => <option key={t} value={t}>{CERT_LABELS[t]}</option>)}
            </NativeSelect>
          </Field>
          {needsExam && (
            <Field id="ci-exam" label="Exam" required error={errors?.exam_id?.[0]} hint="Each student's rank is filled in automatically.">
              {exams.length ? (
                <NativeSelect id="ci-exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
                  {exams.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                </NativeSelect>
              ) : <p className="text-sm text-amber-700">This class has no exams yet.</p>}
            </Field>
          )}
          {needsActivity && (
            <Field id="ci-act" label="Activity" required error={errors?.activity_id?.[0]} hint="Fills {exam} in the wording.">
              {activities.length ? (
                <NativeSelect id="ci-act" value={activityId} onChange={(e) => setActivityId(e.target.value)}>
                  {activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </NativeSelect>
              ) : <p className="text-sm text-amber-700">Record the activity on the Activities page first.</p>}
            </Field>
          )}
          <Field id="ci-date" label="Issue date" error={errors?.issued_on?.[0]}>
            <Input id="ci-date" type="date" value={issuedOn} max={todayISO()} onChange={(e) => setIssuedOn(e.target.value)} />
          </Field>
          <Field id="ci-title" label="Title" required error={errors?.title?.[0]} className="sm:col-span-2">
            <Input id="ci-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>

        <Field id="ci-text" label="Wording" required error={errors?.template?.[0]}
          hint={<>Placeholders: {PLACEHOLDERS.map((p) => <span key={p} title={PLACEHOLDER_HELP[p]} className="mr-1 font-mono">{`{${p}}`}</span>)}. Default wording is set in Settings.</>}>
          <Textarea id="ci-text" rows={4} value={template} onChange={(e) => setTemplate(e.target.value)} />
        </Field>

        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Preview{first ? ` · ${first.name}` : ""}</p>
          <p className="text-center text-lg font-semibold">{title}</p>
          <p className="mt-2 text-center text-sm whitespace-pre-line">{preview || "-"}</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium">
          Students ({selected.length} of {students.length})
          {students.length > 0 && (
            <button type="button" className="text-xs text-primary underline"
              onClick={() => setSelected(selected.length === students.length ? [] : students.map((s) => s.id))}>
              {selected.length === students.length ? "Untick all" : "Tick all"}
            </button>
          )}
        </legend>
        {!students.length ? <p className="text-sm text-muted-foreground">No active students in this class.</p> : (
          <div className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
            {students.map((s) => (
              <CheckboxField key={s.id} id={`ci-s-${s.id}`} checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
                label={<>{s.name} <span className="text-xs text-muted-foreground">{s.admissionNo}</span></>} />
            ))}
          </div>
        )}
        {errors?.student_ids?.[0] && <p className="text-sm text-destructive">{errors.student_ids[0]}</p>}
        <div className="sticky bottom-16 pt-2 lg:bottom-4">
          <Button size="lg" className="w-full shadow-lg" onClick={submit}
            disabled={pending || !selected.length || !title.trim() || !template.trim()
              || (needsExam && !examId) || (needsActivity && !activityId)}>
            {pending ? <Loader2 className="animate-spin" /> : <Award />} Issue {selected.length || ""} certificate{selected.length === 1 ? "" : "s"}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
