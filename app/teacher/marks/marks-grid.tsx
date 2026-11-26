"use client";

import { useMemo, useState, useTransition } from "react";
import type { GradeBand } from "@/lib/grades";
import { computeResults, ordinal, type ResultMark } from "@/lib/results";
import { toast } from "sonner";
import { Check, CircleAlert, Loader2, Save } from "lucide-react";
import { saveMarks } from "@/actions/teacher";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Subject = { id: string; name: string; max: number; passPercent: number };
type Student = { id: string; name: string; nameMl: string | null };
type RowState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Grade, result and rank of one row, as typed so far. */
function LiveResult({ r, className }: { r: ReturnType<typeof computeResults>[number] | undefined; className?: string }) {
  if (!r || (!r.subjectsEntered && !r.examAbsent)) return <span className={cn("text-muted-foreground", className)}>-</span>;
  const tone = r.result === "Pass" ? "text-emerald-700" : r.result === "Fail" || r.result === "Absent" ? "text-red-700" : "text-muted-foreground";
  return (
    <span className={className}>
      {r.grade && <b className="mr-1">{r.grade}</b>}
      <span className={tone}>{r.result ?? "Pending"}</span>
      {r.rank && <span className="ml-1 text-muted-foreground">· {ordinal(r.rank)}</span>}
    </span>
  );
}

/** Parse what the teacher typed: "" -> null, "12.5" -> 12.5, "AB" (missed the subject) -> "AB", otherwise NaN. */
function parse(v: string): number | "AB" | null {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  if (t.toUpperCase() === "AB") return "AB";
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}
const isNumber = (n: number | "AB" | null): n is number => typeof n === "number" && !Number.isNaN(n);

export function MarksGrid({ examId, subjects, students, initial, examAbsent = [], scale, canClear = false }: {
  examId: string; subjects: Subject[]; students: Student[];
  /** saved marks; "AB" for a subject the student missed */
  initial: Record<string, Record<string, number | "AB">>;
  /** students marked absent for the whole exam: no marks */
  examAbsent?: string[];
  scale: GradeBand[];
  /** headmaster only: emptying a saved cell deletes that mark */
  canClear?: boolean;
}) {
  const away = useMemo(() => new Set(examAbsent), [examAbsent]);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(students.map((s) => [s.id,
      Object.fromEntries(subjects.map((sub) => [sub.id, initial[s.id]?.[sub.id]?.toString() ?? ""]))])));

  // grade, result and rank from what is typed now (same maths as the results and report cards)
  const live = useMemo(() => {
    const marks: ResultMark[] = [];
    for (const s of students) {
      for (const sub of subjects) {
        const n = parse(values[s.id][sub.id]);
        if (n === "AB") marks.push({ student_id: s.id, subject_id: sub.id, marks_obtained: 0, is_absent: true });
        else if (isNumber(n) && n <= sub.max) marks.push({ student_id: s.id, subject_id: sub.id, marks_obtained: n });
      }
    }
    const rows = computeResults(students.map((s) => ({ id: s.id, name: s.name, nameMl: s.nameMl, admissionNo: "" })),
      subjects, marks, away, scale);
    return new Map(rows.map((r) => [r.id, r]));
  }, [students, subjects, values, away, scale]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({}); // key student:subject
  const [savingAll, startAll] = useTransition();

  const maxTotal = subjects.reduce((s, x) => s + x.max, 0);

  const cellError = (studentId: string, sub: Subject, raw: string): string | null => {
    const n = parse(raw);
    if (n === null) return !canClear && initial[studentId]?.[sub.id] !== undefined ? "Saved marks cannot be cleared" : null;
    if (n === "AB") return null;
    if (Number.isNaN(n)) return "Numbers, or AB if absent";
    if (n > sub.max) return `Max ${sub.max}`;
    return null;
  };

  const rowPayload = (studentId: string) => {
    const row = values[studentId];
    const marks: Record<string, number | "AB" | null> = {};
    for (const sub of subjects) {
      const n = parse(row[sub.id]);
      // send only entered values (and nothing for untouched blanks)
      if (n === "AB" || isNumber(n)) marks[sub.id] = n;
      else if (n === null && canClear && initial[studentId]?.[sub.id] !== undefined) marks[sub.id] = null;
    }
    return { student_id: studentId, marks };
  };

  const rowHasErrors = (studentId: string) =>
    subjects.some((sub) => cellError(studentId, sub, values[studentId][sub.id]));

  // handlers are recreated each render, so they always see the latest `values`
  const saveRows = async (ids: string[]) => {
    const valid = ids.filter((id) => !away.has(id) && !rowHasErrors(id));
    const rows = valid.map(rowPayload).filter((r) => Object.keys(r.marks).length > 0);
    if (!rows.length) return { ok: valid.length === ids.length };
    setRowState((s) => ({ ...s, ...Object.fromEntries(valid.map((id) => [id, "saving" as const])) }));
    const res = await saveMarks({ exam_id: examId, rows });
    if (!res.ok) {
      setRowState((s) => ({ ...s, ...Object.fromEntries(valid.map((id) => [id, "error" as const])) }));
      if (res.fieldErrors) setErrors((e) => ({ ...e, ...Object.fromEntries(Object.entries(res.fieldErrors!).map(([k, v]) => [k, v[0]])) }));
      toast.error(res.error);
      return { ok: false };
    }
    setRowState((s) => ({ ...s, ...Object.fromEntries(rows.map((r) => [r.student_id, "saved" as const])) }));
    return { ok: valid.length === ids.length };
  };

  const setCell = (studentId: string, subjectId: string, v: string) => {
    setValues((all) => ({ ...all, [studentId]: { ...all[studentId], [subjectId]: v } }));
    setRowState((s) => ({ ...s, [studentId]: "dirty" }));
    setErrors((e) => { const n = { ...e }; delete n[`${studentId}:${subjectId}`]; return n; });
  };

  /** auto-save a row when focus leaves it */
  const onRowBlur = (studentId: string) => (e: React.FocusEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (rowState[studentId] === "dirty") void saveRows([studentId]);
  };

  const saveAll = () => startAll(async () => {
    const dirty = students.filter((s) => rowState[s.id] === "dirty" || rowState[s.id] === "error").map((s) => s.id);
    if (!dirty.length) { toast.info("Nothing to save."); return; }
    const res = await saveRows(dirty);
    if (res.ok) toast.success("All marks saved.");
    else toast.warning("Some rows have errors. Please check the highlighted marks.");
  });

  const total = (studentId: string) =>
    subjects.reduce((sum, sub) => { const n = parse(values[studentId][sub.id]); return sum + (isNumber(n) ? n : 0); }, 0);

  const statusIcon = (id: string) => {
    const st = rowState[id];
    if (st === "saving") return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />;
    if (st === "saved") return <Check className="size-4 text-emerald-600" aria-label="Saved" />;
    if (st === "error") return <CircleAlert className="size-4 text-destructive" aria-label="Error" />;
    if (st === "dirty") return <span className="size-2 rounded-full bg-amber-500" aria-label="Not saved" />;
    return null;
  };

  const input = (s: Student, sub: Subject, className?: string) => {
    const raw = values[s.id][sub.id];
    const absentForExam = away.has(s.id);
    const err = absentForExam ? null : errors[`${s.id}:${sub.id}`] ?? cellError(s.id, sub, raw);
    return (
      <input
        aria-label={`${sub.name} for ${s.name} (max ${sub.max})`}
        aria-invalid={!!err || undefined}
        title={err ?? (absentForExam ? "Absent for the exam" : undefined)}
        inputMode="text" autoComplete="off"
        disabled={absentForExam}
        value={absentForExam ? "AB" : raw}
        onChange={(e) => setCell(s.id, sub.id, e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(
          "h-11 w-full min-w-0 rounded-lg border bg-background px-2 text-center text-base tabular-nums outline-none sm:h-9",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:text-red-700",
          parse(raw) === "AB" && "font-semibold text-red-700",
          err && "border-destructive bg-red-50", className)}
      />
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Marks save automatically when you move to the next student. Type <b>AB</b> for a subject the student missed.
        Maximum: {subjects.map((s) => `${s.name} ${s.max}`).join(" · ")}.
      </p>

      {/* phones: one card per student */}
      <ul className="space-y-3 md:hidden">
        {students.map((s, i) => (
          <li key={s.id} className="rounded-xl border p-3" onBlur={onRowBlur(s.id)}>
            <div className="mb-2 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-medium">{i + 1}. {s.name}</p>
              {statusIcon(s.id)}
              <span className="text-sm font-semibold tabular-nums">{away.has(s.id) ? "Absent" : `${total(s.id)}/${maxTotal}`}</span>
            </div>
            <LiveResult r={live.get(s.id)} className="mb-2 text-xs" />
            <div className="grid grid-cols-2 gap-2">
              {subjects.map((sub) => (
                <label key={sub.id} className="space-y-1">
                  <span className="block truncate text-xs text-muted-foreground">{sub.name} /{sub.max}</span>
                  {input(s, sub)}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {/* tablets/desktop: grid */}
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="sticky left-0 bg-muted/50 px-3 py-2 text-left font-medium">Student</th>
              {subjects.map((sub) => (
                <th key={sub.id} className="px-2 py-2 text-center font-medium">
                  {sub.name}<div className="text-xs font-normal text-muted-foreground">/{sub.max}</div>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total<div className="text-xs font-normal text-muted-foreground">/{maxTotal}</div></th>
              <th className="px-2 py-2 text-left font-medium">Grade · result · rank</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((s) => (
              <tr key={s.id} onBlur={onRowBlur(s.id)}>
                <td className="sticky left-0 bg-background px-3 py-2">
                  <div className="font-medium">{s.name}</div>
                  {s.nameMl && <div className="text-xs text-muted-foreground">{s.nameMl}</div>}
                </td>
                {subjects.map((sub) => <td key={sub.id} className="px-2 py-1.5">{input(s, sub, "w-20 mx-auto block")}</td>)}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{away.has(s.id) ? <span className="text-red-700">Absent</span> : total(s.id)}</td>
                <td className="px-2 py-2 whitespace-nowrap"><LiveResult r={live.get(s.id)} className="text-xs" /></td>
                <td className="px-2">{statusIcon(s.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-16 z-20 lg:bottom-4">
        <Button size="lg" className="w-full shadow-lg" onClick={saveAll} disabled={savingAll}>
          {savingAll ? <Loader2 className="animate-spin" /> : <Save />} Save all
        </Button>
      </div>
    </div>
  );
}
