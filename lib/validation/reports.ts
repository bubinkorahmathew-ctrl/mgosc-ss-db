import { z } from "zod";
import { todayISO } from "@/lib/dates";
import { isoDate, uuid } from "./common";
import { studentFiltersSchema, type StudentFilters } from "./student";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const ok = <T>(schema: z.ZodType<T>, v: unknown): T | undefined => {
  const r = schema.safeParse(v);
  return r.success ? r.data : undefined;
};
export type StudentReportFilters = Omit<StudentFilters, "class_id" | "status" | "as_of" | "page"> & {
  class_id?: string;
  status: "active" | "inactive" | "passed_out" | "all";
  as_of: string;
};

/**
 * The Students page's filters, read leniently (invalid values are ignored). The report names
 * the class `class`; `class_id` is accepted too.
 */
export function parseStudentReport(sp: SP): StudentReportFilters {
  const f: Partial<StudentFilters> = studentFiltersSchema.parse({ ...sp, class_id: one(sp.class) ?? one(sp.class_id) });
  delete f.page;
  return {
    ...f,
    class_id: f.class_id === "none" ? undefined : f.class_id,
    status: f.status ?? "active",
    as_of: f.as_of ?? todayISO(),
  };
}

export type RangeFilters = {
  class_id?: string; from: string; to: string; type?: string;
  /** attendance: the "below X%" line (default 75) and whether to show only those below it */
  below: number; onlyBelow: boolean;
};

export const DEFAULT_ATTENDANCE_BELOW = 75;

export function parseRange(sp: SP, defaults: { from: string; to: string }): RangeFilters {
  let from = ok(isoDate, one(sp.from)) ?? defaults.from;
  let to = ok(isoDate, one(sp.to)) ?? defaults.to;
  if (from > to) [from, to] = [to, from];
  return {
    class_id: ok(uuid, one(sp.class)),
    from, to,
    type: ok(z.enum(["competition", "memory_verse", "event", "note"]), one(sp.type)),
    below: ok(z.coerce.number().min(1).max(100), one(sp.below)) ?? DEFAULT_ATTENDANCE_BELOW,
    onlyBelow: one(sp.only_below) === "1",
  };
}

/** Subtract whole years from YYYY-MM-DD (29 Feb -> 28 Feb). */
export function minusYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ny = y - years;
  const leap = (ny % 4 === 0 && ny % 100 !== 0) || ny % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${String(ny).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** dob bounds so that ageOn(dob, asOf) is within [min, max]. */
export function dobBoundsForAge(asOf: string, min?: number, max?: number) {
  return {
    /** dob <= latest  => age >= min */
    latest: min !== undefined ? minusYears(asOf, min) : undefined,
    /** dob > earliestExclusive  => age <= max */
    earliestExclusive: max !== undefined ? minusYears(asOf, max + 1) : undefined,
  };
}

export function toQuery(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.toString();
}
