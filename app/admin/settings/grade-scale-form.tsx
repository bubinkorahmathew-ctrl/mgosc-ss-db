"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { saveGradeScale, saveTopperSettings } from "@/actions/results";
import { scaleProblems, type GradeBand } from "@/lib/grades";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = { min: string; max: string; grade: string; point: string; remark: string; pass: boolean };
const toRow = (b: GradeBand): Row => ({
  min: String(b.min_percent), max: String(b.max_percent), grade: b.grade,
  point: b.grade_point === null ? "" : String(b.grade_point), remark: b.remark ?? "", pass: b.is_pass,
});
const toBand = (r: Row): GradeBand => ({
  min_percent: Number(r.min), max_percent: Number(r.max), grade: r.grade.trim(),
  grade_point: r.point.trim() === "" ? null : Number(r.point), remark: r.remark.trim() || null, is_pass: r.pass,
});

/** The grade bands, edited as a whole. Saved only when they cover 0-100 with no gap or overlap. */
export function GradeScaleForm({ scale, minPct }: { scale: GradeBand[]; minPct: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(() => [...scale].sort((a, b) => b.min_percent - a.min_percent).map(toRow));
  const [min, setMin] = useState(String(minPct));
  const problems = useMemo(() => {
    if (rows.some((r) => r.min === "" || r.max === "" || Number.isNaN(Number(r.min)) || Number.isNaN(Number(r.max)))) {
      return ["Fill in every From and To with a number."];
    }
    return scaleProblems(rows.map(toBand));
  }, [rows]);

  const set = (i: number, patch: Partial<Row>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () => start(async () => {
    const res = await saveGradeScale(rows.map(toBand));
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
    router.refresh();
  });
  const saveMin = () => start(async () => {
    const res = await saveTopperSettings({ attendance_topper_min_pct: Number(min) });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Saved.");
    router.refresh();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grades and toppers</CardTitle>
        <p className="text-sm text-muted-foreground">
          Grades for each subject and for the overall percentage. Bands must cover 0 to 100 without a gap or an overlap:
          a band starts 0.01 above where the band below it ends (e.g. D 40 to 49.99, C 50 to 59.99).
          Pass marks per subject are set on Subjects &amp; Exams.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>{["Grade", "From %", "To %", "Grade point", "Remark", "Pass", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5"><Input aria-label="Grade" value={r.grade} maxLength={8} className="w-16" onChange={(e) => set(i, { grade: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><Input aria-label={`${r.grade} from %`} inputMode="decimal" value={r.min} className="w-20" onChange={(e) => set(i, { min: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><Input aria-label={`${r.grade} to %`} inputMode="decimal" value={r.max} className="w-20" onChange={(e) => set(i, { max: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><Input aria-label={`${r.grade} grade point`} inputMode="decimal" value={r.point} placeholder="-" className="w-16" onChange={(e) => set(i, { point: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><Input aria-label={`${r.grade} remark`} value={r.remark} maxLength={60} className="min-w-32" onChange={(e) => set(i, { remark: e.target.value })} /></td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" aria-label={`${r.grade} is a pass`} className="size-5 accent-[var(--primary)]" checked={r.pass}
                      onChange={(e) => set(i, { pass: e.target.checked })} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Button variant="ghost" size="icon" aria-label={`Remove ${r.grade}`} disabled={rows.length < 2}
                      onClick={() => setRows((all) => all.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {problems.length > 0 && (
          <ul className="list-disc space-y-0.5 rounded-lg bg-amber-50 py-2 pr-3 pl-7 text-sm text-amber-950" aria-live="polite">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRows((all) => [...all, { min: "", max: "", grade: "", point: "", remark: "", pass: true }])}>
            <Plus /> Add band
          </Button>
          <Button onClick={save} disabled={pending || problems.length > 0}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save grade scale
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <label className="space-y-1.5 text-sm">
            <span className="block font-medium">Attendance topper: Sundays that must have had attendance</span>
            <span className="flex items-center gap-2">
              <Input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className="w-20" aria-label="Minimum % of Sundays" /> %
            </span>
            <span className="block text-xs text-muted-foreground">If a class took attendance on fewer of the period&apos;s Sundays, it gets no attendance topper.</span>
          </label>
          <Button variant="outline" onClick={saveMin} disabled={pending || min === "" || Number(min) < 0 || Number(min) > 100 || String(Number(min)) !== min.trim()}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
