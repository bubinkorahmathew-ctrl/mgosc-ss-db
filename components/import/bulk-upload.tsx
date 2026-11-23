"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, Loader2, Save, Upload } from "lucide-react";
import { importAttendance, importMarks, importStudents } from "@/actions/import";
import type { ActionResult } from "@/lib/action-result";
import type { ImportReport } from "@/lib/import/parse";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/form/field";

export type UploadKind = "students" | "marks" | "attendance";
type Option = { id: string; label: string };

const ACTIONS: Record<UploadKind, (f: FormData) => Promise<ActionResult<ImportReport>>> = {
  students: importStudents, marks: importMarks, attendance: importAttendance,
};
const MAX_BYTES = 900 * 1024;

export function BulkUpload({ kind, options, noClassLabel, today }: {
  kind: UploadKind;
  /** classes (students, attendance) or exams (marks) */
  options: Option[];
  /** students only: offer "no class yet" with this label */
  noClassLabel?: string;
  today: string;
}) {
  const [target, setTarget] = useState(options[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setReport(null); setMessage(null);
    if (input.current) input.current.value = "";
  };

  const send = (mode: "check" | "save", f: File) => start(async () => {
    setSaving(mode === "save");
    const data = new FormData();
    data.set("mode", mode);
    data.set("target", target);
    data.set("file", f);
    const res = await ACTIONS[kind](data);
    setSaving(false);
    if (!res.ok) { setReport(null); setMessage(null); toast.error(res.error); return; }
    if (mode === "save" && res.data?.saved !== undefined) {
      toast.success(res.message ?? "Saved.");
      reset();
      return;
    }
    setReport(res.data ?? null);
    setMessage(res.message ?? null);
  });

  const choose = (f: File | undefined) => {
    setReport(null); setMessage(null);
    if (!f) { setFile(null); return; }
    if (!/\.xlsx$/i.test(f.name)) { toast.error("Choose an Excel file (.xlsx)."); reset(); return; }
    if (f.size > MAX_BYTES) { toast.error("The file is too large. Upload at most 500 rows at a time."); reset(); return; }
    setFile(f);
    send("check", f);
  };

  const label = kind === "marks" ? "Exam" : "Class";
  const templateHref = kind === "students" ? "/api/import-template/students"
    : kind === "marks" ? `/api/import-template/marks?exam=${encodeURIComponent(target)}`
      : `/api/import-template/attendance?class=${encodeURIComponent(target)}&date=${encodeURIComponent(date)}`;
  const ok = report && !report.fileErrors.length && !report.problems && report.ready > 0;

  return (
    <div className="space-y-5">
      <ol className="space-y-5">
        <Step n={1} title={kind === "marks" ? "Choose the exam" : "Choose the class"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`bu-${kind}-target`} label={label}>
              <NativeSelect id={`bu-${kind}-target`} value={target} onChange={(e) => { setTarget(e.target.value); reset(); }}>
                {noClassLabel !== undefined && <option value="">{noClassLabel}</option>}
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </NativeSelect>
            </Field>
            {kind === "attendance" && (
              <Field id="bu-date" label="First date in the template" hint="You can add more date columns in Excel.">
                <Input id="bu-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} />
              </Field>
            )}
          </div>
          {kind === "students" && (
            <p className="mt-2 text-sm text-muted-foreground">Every student in the file goes into this class.</p>
          )}
        </Step>

        <Step n={2} title="Download the template and fill it in">
          <Button variant="outline" render={<a href={templateHref} />} nativeButton={false}>
            <Download /> Download template
          </Button>
          <p className="mt-2 text-sm text-muted-foreground">
            {kind === "students" && "One student per row. The \"How to fill\" sheet explains each column."}
            {kind === "marks" && "The class's students are listed with any marks already saved. Blank cells are left as they are."}
            {kind === "attendance" && "The class's students are listed. Enter P, A or L under each date."}
          </p>
        </Step>

        <Step n={3} title="Upload the file and check it">
          <label className={cn(
            "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center",
            "hover:bg-muted/50 focus-within:ring-3 focus-within:ring-ring/50")}>
            {pending && !saving ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <Upload className="size-6 text-muted-foreground" />}
            <span className="text-sm font-medium">{file ? file.name : "Choose the filled-in Excel file"}</span>
            <span className="text-xs text-muted-foreground">.xlsx, at most 500 rows. Nothing is saved yet.</span>
            <input ref={input} type="file" className="sr-only" disabled={pending || (!target && kind !== "students")}
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => choose(e.target.files?.[0])} />
          </label>
        </Step>
      </ol>

      {report && <ReportView report={report} message={message} />}

      {report && file && (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" disabled={!ok || pending} onClick={() => send("save", file)}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}{" "}
            {kind === "students" ? `Save ${report.ready} student${report.ready === 1 ? "" : "s"}`
              : `Save ${kind} for ${report.ready} student${report.ready === 1 ? "" : "s"}`}
          </Button>
          <Button size="lg" variant="outline" disabled={pending} onClick={() => send("check", file)}>Check again</Button>
          <Button size="lg" variant="ghost" disabled={pending} onClick={reset}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-xl border p-4">
      <h2 className="mb-3 flex items-center gap-2 font-medium">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
        {title}
      </h2>
      {children}
    </li>
  );
}

function ReportView({ report, message }: { report: ImportReport; message: string | null }) {
  const clean = !report.fileErrors.length && !report.problems;
  const rows = [...report.rows].sort((a, b) => Number(!!b.errors.length) - Number(!!a.errors.length) || a.row - b.row);
  return (
    <section aria-live="polite" className="space-y-3">
      <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm",
        clean ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900")}>
        {clean ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
        <div>
          <p className="font-medium">{message}</p>
          <p>{report.rows.length} rows read · {report.ready} ready · {report.problems} with problems</p>
          {!!report.fileErrors.length && (
            <ul className="mt-2 list-disc pl-5">{report.fileErrors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
        </div>
      </div>

      {!!rows.length && (
        <div className="max-h-[28rem] overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Row</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.row} className={r.errors.length ? "bg-red-50/60" : undefined}>
                  <td className="px-3 py-2 align-top tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><FileSpreadsheet className="size-3.5" />{r.row}</span>
                  </td>
                  <td className="px-3 py-2 align-top font-medium">{r.name}</td>
                  <td className="px-3 py-2 align-top">
                    {r.errors.length
                      ? <ul className="space-y-0.5 text-destructive">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                      : <span className="text-muted-foreground">{r.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
