"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { monthGrid, shiftMonth } from "@/lib/calendar";

type Day = { date: string; status: "present" | "absent" | "late"; remark: string | null };

const STYLE: Record<Day["status"], string> = {
  present: "bg-emerald-600 text-white",
  late: "bg-amber-500 text-white",
  absent: "bg-red-600 text-white",
};
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** One student's attendance, a month at a time, coloured by status. */
export function StudentAttendanceCalendar({ days, today }: { days: Day[]; today: string }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const latest = (days[0]?.date ?? today).slice(0, 7);
  const [month, setMonth] = useState(latest);
  const monthDays = days.filter((d) => d.date.startsWith(month));
  const counts = { present: 0, late: 0, absent: 0 };
  for (const d of monthDays) counts[d.status]++;
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div className="max-w-sm">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></Button>
        <p className="text-sm font-medium" aria-live="polite">{label}</p>
        <Button variant="ghost" size="icon" aria-label="Next month" disabled={month >= today.slice(0, 7)}
          onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((d, i) => <div key={i} className="py-1 font-medium text-muted-foreground">{d}</div>)}
        {monthGrid(month).map((date, i) => {
          if (!date) return <div key={`b${i}`} />;
          const d = byDate.get(date);
          return (
            <div key={date} title={d ? `${d.status}${d.remark ? `: ${d.remark}` : ""}` : undefined}
              aria-label={`${date}${d ? `, ${d.status}` : ""}`}
              className={cn("flex aspect-square items-center justify-center rounded-md tabular-nums",
                d ? STYLE[d.status] : "text-muted-foreground")}>
              {Number(date.slice(8))}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {monthDays.length ? `${counts.present} present · ${counts.late} late · ${counts.absent} absent this month` : "No attendance this month."}
      </p>
    </div>
  );
}
