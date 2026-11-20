"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Loader2, Save } from "lucide-react";
import { saveAttendance } from "@/actions/teacher";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "present" | "absent" | "late";
const OPTIONS: { value: Status; label: string; short: string; on: string }[] = [
  { value: "present", label: "Present", short: "P", on: "bg-emerald-600 text-white border-emerald-600" },
  { value: "late", label: "Late", short: "L", on: "bg-amber-500 text-white border-amber-500" },
  { value: "absent", label: "Absent", short: "A", on: "bg-red-600 text-white border-red-600" },
];

export function AttendanceSheet({ classId, date, today, students, saved }: {
  classId: string; date: string; today: string;
  students: { id: string; name: string; nameMl: string | null; admissionNo: string }[];
  saved: Record<string, Status>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const isSaved = Object.keys(saved).length > 0;
  // unmarked students default to present so a full class takes one tap per absentee
  const [marks, setMarks] = useState<Record<string, Status>>(() =>
    Object.fromEntries(students.map((s) => [s.id, saved[s.id] ?? "present"])));

  const dirty = useMemo(
    () => !isSaved || students.some((s) => marks[s.id] !== saved[s.id]),
    [isSaved, students, marks, saved]);
  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0 };
    for (const s of students) c[marks[s.id]]++;
    return c;
  }, [students, marks]);

  const changeDate = (d: string) => {
    if (!d) return;
    if (dirty && isSaved && !confirm("You have unsaved changes. Switch date anyway?")) return;
    const next = new URLSearchParams(params.toString());
    next.set("date", d);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const save = () => start(async () => {
    const res = await saveAttendance({
      class_id: classId, date,
      entries: students.map((s) => ({ student_id: s.id, status: marks[s.id] })),
    });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="att-date" className="text-sm font-medium">Date</label>
          <Input id="att-date" type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value)} className="w-44" />
        </div>
        <Button variant="outline" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.id, "present"])))}>
          <CheckCheck /> All present
        </Button>
      </div>

      <p className={cn("rounded-lg px-3 py-2 text-sm",
        isSaved && !dirty ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
        {formatDate(date)}: {isSaved && !dirty ? "saved" : isSaved ? "changes not saved yet" : "not saved yet"} ·{" "}
        {counts.present} present · {counts.late} late · {counts.absent} absent
      </p>

      <ul className="divide-y rounded-xl border">
        {students.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium"><span className="mr-2 text-muted-foreground">{i + 1}.</span>{s.name}</p>
              {s.nameMl && <p className="truncate text-sm text-muted-foreground">{s.nameMl}</p>}
            </div>
            <div role="radiogroup" aria-label={`Attendance for ${s.name}`} className="grid grid-cols-3 gap-2 sm:w-72">
              {OPTIONS.map((o) => {
                const on = marks[s.id] === o.value;
                return (
                  <button key={o.value} type="button" role="radio" aria-checked={on}
                    onClick={() => setMarks((m) => ({ ...m, [s.id]: o.value }))}
                    className={cn("min-h-12 rounded-lg border text-sm font-semibold transition-colors sm:min-h-10",
                      on ? o.on : "bg-background text-muted-foreground hover:bg-muted")}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      {/* sticky save bar above the mobile bottom nav */}
      <div className="sticky bottom-16 z-20 lg:bottom-4">
        <Button size="lg" className="w-full shadow-lg" onClick={save} disabled={pending || !dirty}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} {dirty ? "Save attendance" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
