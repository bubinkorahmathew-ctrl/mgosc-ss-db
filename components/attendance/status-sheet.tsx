"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck, Loader2, MessageSquarePlus, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SheetStudent = { id: string; name: string; nameMl: string | null; admissionNo: string };
export type StatusOption<S extends string> = { value: S; label: string; on: string; counter: string };
type Entry<S> = { status: S; remark: string };

export const DAILY_OPTIONS: StatusOption<"present" | "late" | "absent">[] = [
  { value: "present", label: "Present", on: "bg-emerald-600 text-white border-emerald-600", counter: "text-emerald-700" },
  { value: "late", label: "Late", on: "bg-amber-500 text-white border-amber-500", counter: "text-amber-700" },
  { value: "absent", label: "Absent", on: "bg-red-600 text-white border-red-600", counter: "text-red-700" },
];
export const EXAM_OPTIONS: StatusOption<"present" | "absent">[] = [
  { value: "present", label: "Present", on: "bg-emerald-600 text-white border-emerald-600", counter: "text-emerald-700" },
  { value: "absent", label: "Absent", on: "bg-red-600 text-white border-red-600", counter: "text-red-700" },
];

/**
 * One row per student with a toggle per status, "Mark all present", tick boxes for setting
 * several students at once, an optional remark each, and live totals. Saving sends every row
 * in one call, which the server writes in one transaction.
 */
export function StatusSheet<S extends string>({
  title, options, students, saved, readOnly, onSave, saveLabel = "Save attendance",
}: {
  title: React.ReactNode;
  options: StatusOption<S>[];
  students: SheetStudent[];
  saved: Record<string, { status: S; remark: string | null }>;
  /** shown instead of the save button; toggles are disabled */
  readOnly?: string;
  onSave: (entries: { student_id: string; status: S; remark: string | null }[]) =>
    Promise<{ ok: boolean; error?: string; message?: string }>;
  saveLabel?: string;
}) {
  const [pending, start] = useTransition();
  const first = options[0].value; // "present": unmarked students start there, so a full class is one tap per absentee
  const initial = useMemo(() => Object.fromEntries(students.map((s) =>
    [s.id, { status: saved[s.id]?.status ?? first, remark: saved[s.id]?.remark ?? "" }])) as Record<string, Entry<S>>,
  [students, saved, first]);
  const [rows, setRows] = useState(initial);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [remarksOpen, setRemarksOpen] = useState<Set<string>>(() => new Set(students.filter((s) => saved[s.id]?.remark).map((s) => s.id)));

  const isSaved = students.some((s) => saved[s.id]);
  const dirty = !isSaved || students.some((s) =>
    rows[s.id].status !== saved[s.id]?.status || rows[s.id].remark.trim() !== (saved[s.id]?.remark ?? ""));
  const counts = useMemo(() => {
    const c = Object.fromEntries(options.map((o) => [o.value, 0])) as Record<S, number>;
    for (const s of students) c[rows[s.id].status]++;
    return c;
  }, [students, rows, options]);

  const set = (ids: Iterable<string>, status: S) =>
    setRows((r) => { const next = { ...r }; for (const id of ids) next[id] = { ...next[id], status }; return next; });
  const allTicked = ticked.size === students.length && students.length > 0;

  const save = () => start(async () => {
    const res = await onSave(students.map((s) => ({ student_id: s.id, status: rows[s.id].status, remark: rows[s.id].remark.trim() || null })));
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
    setTicked(new Set());
  });

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-sm",
        isSaved && !dirty ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950")}>
        <span className="font-medium">{title}</span>
        <span>{isSaved && !dirty ? "Saved" : isSaved ? "Changes not saved yet" : "Not saved yet"}</span>
        <span className="flex flex-wrap gap-3" aria-live="polite">
          {options.map((o) => <span key={o.value}><b className={o.counter}>{counts[o.value]}</b> {o.label.toLowerCase()}</span>)}
          <span><b>{students.length}</b> total</span>
        </span>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => set(students.map((s) => s.id), first)}>
            <CheckCheck /> Mark all {options[0].label.toLowerCase()}
          </Button>
          {ticked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1">
              <span className="text-sm">{ticked.size} ticked: set</span>
              {options.map((o) => (
                <Button key={o.value} size="sm" variant="outline" onClick={() => { set(ticked, o.value); setTicked(new Set()); }}>
                  {o.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <ul className="divide-y rounded-xl border">
        {!readOnly && (
          <li className="flex items-center gap-3 bg-muted/40 px-3 py-2 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" aria-label="Tick every student"
              checked={allTicked} onChange={() => setTicked(allTicked ? new Set() : new Set(students.map((s) => s.id)))} />
            <span className="text-muted-foreground">Tick students to set them together</span>
          </li>
        )}
        {students.map((s, i) => {
          const row = rows[s.id];
          const remarkOpen = remarksOpen.has(s.id);
          return (
            <li key={s.id} className="space-y-2 px-3 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {!readOnly && (
                    <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" aria-label={`Tick ${s.name}`}
                      checked={ticked.has(s.id)}
                      onChange={() => setTicked((t) => { const n = new Set(t); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium"><span className="mr-2 text-muted-foreground">{i + 1}.</span>{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.admissionNo}{s.nameMl ? ` · ${s.nameMl}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div role="radiogroup" aria-label={`Attendance for ${s.name}`}
                    className={cn("grid flex-1 gap-2 sm:w-72", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                    {options.map((o) => {
                      const on = row.status === o.value;
                      return (
                        <button key={o.value} type="button" role="radio" aria-checked={on} disabled={!!readOnly}
                          onClick={() => set([s.id], o.value)}
                          className={cn("min-h-11 rounded-lg border text-sm font-semibold transition-colors sm:min-h-10",
                            on ? o.on : "bg-background text-muted-foreground hover:bg-muted", readOnly && "cursor-not-allowed")}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  {!readOnly && (
                    <Button variant="ghost" size="icon" aria-label={`Remark for ${s.name}`} aria-expanded={remarkOpen}
                      onClick={() => setRemarksOpen((r) => { const n = new Set(r); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}>
                      <MessageSquarePlus className={row.remark ? "text-primary" : undefined} />
                    </Button>
                  )}
                </div>
              </div>
              {(remarkOpen || (readOnly && row.remark)) && (
                <Input aria-label={`Remark for ${s.name}`} placeholder="Remark (optional)" maxLength={200} value={row.remark}
                  disabled={!!readOnly}
                  onChange={(e) => setRows((r) => ({ ...r, [s.id]: { ...r[s.id], remark: e.target.value } }))} />
              )}
            </li>
          );
        })}
      </ul>

      {readOnly ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{readOnly}</p>
      ) : (
        <div className="sticky bottom-16 z-20 lg:bottom-4">
          <Button size="lg" className="w-full shadow-lg" onClick={save} disabled={pending || !dirty}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} {dirty ? saveLabel : "Saved"}
          </Button>
        </div>
      )}
    </div>
  );
}
