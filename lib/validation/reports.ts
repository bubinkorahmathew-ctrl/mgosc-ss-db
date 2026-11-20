import { z } from "zod";
import { SCHOOL_CLASSES } from "@/lib/config";
import { todayISO } from "@/lib/dates";
import { isoDate, uuid } from "./common";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const ok = <T>(schema: z.ZodType<T>, v: unknown): T | undefined => {
  const r = schema.safeParse(v);
  return r.success ? r.data : undefined;
};
const age = z.coerce.number().int().min(0).max(100);

export type StudentReportFilters = {
  class_id?: string; school_class?: string; gender?: "male" | "female";
  status: "active" | "inactive" | "passed_out" | "all";
  age_min?: number; age_max?: number; as_of: string;
};

/** Lenient parsing of report filters from the URL: invalid values are simply ignored. */
export function parseStudentReport(sp: SP): StudentReportFilters {
  return {
    class_id: ok(uuid, one(sp.class)),
    school_class: ok(z.enum(SCHOOL_CLASSES), one(sp.school_class)),
    gender: ok(z.enum(["male", "female"]), one(sp.gender)),
    status: ok(z.enum(["active", "inactive", "passed_out", "all"]), one(sp.status)) ?? "active",
    age_min: ok(age, one(sp.age_min)),
    age_max: ok(age, one(sp.age_max)),
    as_of: ok(isoDate, one(sp.as_of)) ?? todayISO(),
  };
}

export type RangeFilters = { class_id?: string; from: string; to: string; type?: string };

export function parseRange(sp: SP, defaults: { from: string; to: string }): RangeFilters {
  let from = ok(isoDate, one(sp.from)) ?? defaults.from;
  let to = ok(isoDate, one(sp.to)) ?? defaults.to;
  if (from > to) [from, to] = [to, from];
  return {
    class_id: ok(uuid, one(sp.class)),
    from, to,
    type: ok(z.enum(["competition", "memory_verse", "event", "note"]), one(sp.type)),
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
