"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { dayPercent, isSunday, monthGrid, shiftMonth } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type DaySummary = { marked: number; attended: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

/**
 * A month of a class's attendance. Saved days show a dot and the class's attendance %.
 * Sundays are highlighted; future days cannot be picked; other weekdays ask first.
 */
export function AttendanceCalendar({ month, today, selected, days, editableFrom }: {
  month: string; today: string; selected: string | null;
  days: Record<string, DaySummary>;
  /** teachers: the oldest date they can still change (older days open read-only) */
  editableFrom: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const pick = (date: string) => {
    if (date > today) return;
    if (!isSunday(date) && !days[date]
      && !confirm(`${new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))} is not a Sunday. Open it for attendance anyway?`)) return;
    go({ date, month });
  };

  const atLatest = month >= today.slice(0, 7);

  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => go({ month: shiftMonth(month, -1), date: null })}>
          <ChevronLeft />
        </Button>
        <p className="flex items-center gap-2 font-medium" aria-live="polite">
          {monthName(month)}{pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </p>
        <Button variant="ghost" size="icon" aria-label="Next month" disabled={atLatest}
          onClick={() => go({ month: shiftMonth(month, 1), date: null })}>
          <ChevronRight />
        </Button>
      </div>
      <div role="grid" aria-label={`Attendance in ${monthName(month)}`} className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} role="columnheader" className={cn("py-1 text-xs font-medium text-muted-foreground", d === "Sun" && "text-primary")}>{d}</div>
        ))}
        {monthGrid(month).map((date, i) => {
          if (!date) return <div key={`b${i}`} />;
          const s = days[date];
          const future = date > today;
          const sunday = isSunday(date);
          const pct = s ? dayPercent(s.marked, s.attended) : null;
          const old = editableFrom !== null && date < editableFrom;
          return (
            <button key={date} type="button" role="gridcell" disabled={future} onClick={() => pick(date)}
              aria-selected={date === selected} aria-current={date === today ? "date" : undefined}
              aria-label={`${date}${sunday ? ", Sunday" : ""}${s ? `, saved, ${pct}% attended` : ""}${old ? ", view only" : ""}`}
              className={cn(
                "flex min-h-14 flex-col items-center justify-start rounded-lg border border-transparent px-0.5 py-1 text-sm transition-colors",
                sunday && !future && "bg-primary/10 font-semibold text-primary",
                future ? "cursor-not-allowed text-muted-foreground/40" : "hover:border-border hover:bg-muted",
                date === today && "ring-1 ring-primary/50",
                date === selected && "border-primary bg-primary text-primary-foreground hover:bg-primary",
              )}>
              <span>{Number(date.slice(8))}</span>
              {s && (
                <span className="mt-0.5 flex items-center gap-1 text-[11px] leading-none font-medium tabular-nums">
                  <span className={cn("size-1.5 rounded-full", date === selected ? "bg-primary-foreground" : "bg-emerald-600")} aria-hidden />
                  {pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Sundays are highlighted. A dot shows a saved day and the class&apos;s attendance that day.
        {editableFrom && " Days more than 14 days ago open view-only."}
      </p>
    </div>
  );
}
