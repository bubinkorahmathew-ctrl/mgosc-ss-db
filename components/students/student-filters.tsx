"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { SCHOOL_CLASSES } from "@/lib/config";
import { STUDENT_FILTER_KEYS } from "@/lib/validation/student";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/form/field";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MORE = ["prayer_unit_id", "age_min", "age_max", "as_of", "dob_from", "dob_to", "dob_year", "dob_month", "incomplete"];

/**
 * URL-driven filters for the students list. Every filter combines with the others, and the URL
 * keeps them, so a filtered list can be bookmarked or shared.
 */
export function StudentFilters({ classes, prayerUnits, showClassFilter = true }: {
  classes: { id: string; label: string }[];
  prayerUnits: { id: string; name: string }[];
  showClassFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [more, setMore] = useState(() => MORE.some((k) => params.get(k)));

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const value = (key: string) => params.get(key) ?? "";

  // debounce the search box
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = STUDENT_FILTER_KEYS.some((k) => params.get(k));
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1990 + 1 }, (_, i) => thisYear - i);

  return (
    <div className="mb-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Search name, admission no or father's / guardian phone" value={q}
            onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search students" />
          {pending && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <Button variant={more ? "secondary" : "outline"} onClick={() => setMore(!more)} aria-expanded={more}>
          <SlidersHorizontal /> More filters
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {showClassFilter && (
          <NativeSelect aria-label="Sunday School class" value={value("class_id")}
            onChange={(e) => update("class_id", e.target.value)}>
            <option value="">All SS classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            <option value="none">No class assigned</option>
          </NativeSelect>
        )}
        <NativeSelect aria-label="School class" value={value("school_class")}
          onChange={(e) => update("school_class", e.target.value)}>
          <option value="">All school classes</option>
          {SCHOOL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Gender" value={value("gender")}
          onChange={(e) => update("gender", e.target.value)}>
          <option value="">Boys &amp; girls</option>
          <option value="male">Boys</option>
          <option value="female">Girls</option>
        </NativeSelect>
        <NativeSelect aria-label="Status" value={value("status")}
          onChange={(e) => update("status", e.target.value)}>
          <option value="">Active</option>
          <option value="inactive">Inactive</option>
          <option value="passed_out">Passed out</option>
          <option value="all">All statuses</option>
        </NativeSelect>
      </div>

      {more && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-4">
          <label className="col-span-2 space-y-1 text-xs font-medium sm:col-span-1">Prayer unit
            <NativeSelect value={value("prayer_unit_id")} onChange={(e) => update("prayer_unit_id", e.target.value)}>
              <option value="">All prayer units</option>
              {prayerUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-xs font-medium">Age from
            <Input key={value("age_min")} inputMode="numeric" placeholder="any" defaultValue={value("age_min")}
              onBlur={(e) => update("age_min", e.target.value.trim())} />
          </label>
          <label className="space-y-1 text-xs font-medium">Age to
            <Input key={value("age_max")} inputMode="numeric" placeholder="any" defaultValue={value("age_max")}
              onBlur={(e) => update("age_max", e.target.value.trim())} />
          </label>
          <label className="col-span-2 space-y-1 text-xs font-medium sm:col-span-1">Age as on
            <Input type="date" value={value("as_of")} onChange={(e) => update("as_of", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-medium">Born from
            <Input type="date" value={value("dob_from")} onChange={(e) => update("dob_from", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-medium">Born to
            <Input type="date" value={value("dob_to")} onChange={(e) => update("dob_to", e.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-medium">Birth year
            <NativeSelect value={value("dob_year")} onChange={(e) => update("dob_year", e.target.value)}>
              <option value="">Any year</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-xs font-medium">Birth month
            <NativeSelect value={value("dob_month")} onChange={(e) => update("dob_month", e.target.value)}>
              <option value="">Any month</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </NativeSelect>
          </label>
          <label className="col-span-2 flex min-h-9 items-center gap-2 text-sm sm:col-span-4">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={value("incomplete") === "1"}
              onChange={(e) => update("incomplete", e.target.checked ? "1" : "")} />
            Incomplete records only (prayer unit &quot;Not assigned&quot; or father&apos;s name &quot;Not given&quot;)
          </label>
        </div>
      )}

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => { setQ(""); start(() => router.replace(pathname)); }}>
          <X /> Clear filters
        </Button>
      )}
    </div>
  );
}
