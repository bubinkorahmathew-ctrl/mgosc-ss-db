import "server-only";
import { FATHER_NAME_PLACEHOLDER, NOT_ASSIGNED_PRAYER_UNIT } from "@/lib/config";
import { todayISO } from "@/lib/dates";
import { createClient } from "@/lib/db/server";
import type { Condition } from "@/lib/db/sql";
import { dobBoundsForAge } from "@/lib/validation/reports";
import type { StudentFilters } from "@/lib/validation/student";

export const STUDENTS_PAGE_SIZE = 50;

/** Strip LIKE wildcards and punctuation from search text. (Values are always sent as parameters.) */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\:"'_]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

const pad = (n: number) => String(n).padStart(2, "0");
const monthStart = (y: number, m: number) => `${y}-${pad(m)}-01`;
const nextMonthStart = (y: number, m: number) => (m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1));
const FIRST_BIRTH_YEAR = 1990; // the oldest date of birth the forms accept

/** One record to fix: it still holds a placeholder written when the fields became required. */
export const INCOMPLETE: Condition = {
  or: [["prayer_unit_id", "eq", NOT_ASSIGNED_PRAYER_UNIT], ["father_name", "eq", FATHER_NAME_PLACEHOLDER]],
};

/** The filters as conditions on `students`. Every filter combines with the others (AND). */
export function studentConditions(f: Omit<Partial<StudentFilters>, "class_id"> & { class_id?: string }): Condition[] {
  const c: Condition[] = [];
  const status = f.status ?? "active";
  if (status !== "all") c.push(["status", "eq", status]);
  if (f.class_id === "none") c.push(["class_id", "is", null]);
  else if (f.class_id) c.push(["class_id", "eq", f.class_id]);
  if (f.school_class) c.push(["school_class", "eq", f.school_class]);
  if (f.gender) c.push(["gender", "eq", f.gender]);
  if (f.prayer_unit_id) c.push(["prayer_unit_id", "eq", f.prayer_unit_id]);

  const { latest, earliestExclusive } = dobBoundsForAge(f.as_of ?? todayISO(), f.age_min, f.age_max);
  if (latest) c.push(["dob", "lte", latest]);
  if (earliestExclusive) c.push(["dob", "gt", earliestExclusive]);
  if (f.dob_from) c.push(["dob", "gte", f.dob_from]);
  if (f.dob_to) c.push(["dob", "lte", f.dob_to]);

  const { dob_year: y, dob_month: m } = f;
  if (y && m) c.push(["dob", "gte", monthStart(y, m)], ["dob", "lt", nextMonthStart(y, m)]);
  else if (y) c.push(["dob", "gte", `${y}-01-01`], ["dob", "lt", `${y + 1}-01-01`]);
  else if (m) {
    // born in this month of any year
    const last = Number(todayISO().slice(0, 4));
    const years = Array.from({ length: last - FIRST_BIRTH_YEAR + 1 }, (_, i) => FIRST_BIRTH_YEAR + i);
    c.push({ or: years.map((yr): Condition => ({ and: [["dob", "gte", monthStart(yr, m)], ["dob", "lt", nextMonthStart(yr, m)]] })) });
  }

  if (f.incomplete) c.push(INCOMPLETE);

  if (f.q) {
    const q = sanitizeSearch(f.q);
    if (q) {
      const like = `%${q}%`;
      const digits = q.replace(/[\s-]/g, "");
      c.push({
        or: [
          ["full_name", "ilike", like],
          ["admission_no", "ilike", like],
          ["guardian_phone", "ilike", `%${digits}%`],
          ["father_phone", "ilike", `%${digits}%`],
        ],
      });
    }
  }
  return c;
}

/** Sorting by age means sorting by date of birth the other way round. */
export function studentOrder(f: Pick<StudentFilters, "sort" | "dir">) {
  const desc = f.dir === "desc";
  switch (f.sort) {
    case "age": return { column: "dob", ascending: desc };
    case "dob": return { column: "dob", ascending: !desc };
    default: return { column: "full_name", ascending: !desc };
  }
}

/** Students list for the caller (the policies limit teachers to their classes). */
export async function listStudents(f: StudentFilters) {
  const dbc = await createClient();
  const page = f.page ?? 1;
  const order = studentOrder(f);
  let query = dbc
    .from("students")
    .select("id, admission_no, full_name, full_name_ml, dob, gender, school_class, guardian_phone, father_phone, status, class_id, prayer_unit_id, father_name, classes(name, section), prayer_units(name)",
      { count: "exact" })
    .match(studentConditions(f))
    .order(order.column, { ascending: order.ascending });
  if (order.column !== "full_name") query = query.order("full_name");
  const from = (page - 1) * STUDENTS_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + STUDENTS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / STUDENTS_PAGE_SIZE)) };
}

/** Prayer units for drop-downs and filters: everyone may read them. */
export async function getPrayerUnits() {
  const dbc = await createClient();
  const { data, error } = await dbc.from("prayer_units").select("id, name, active").order("name");
  if (error) throw error;
  return data ?? [];
}

/** How many students and registrations use each unit (a used unit can't be deleted). */
export async function prayerUnitUsage() {
  const dbc = await createClient();
  const [students, registrations] = await Promise.all([
    dbc.from("students").select("prayer_unit_id"),
    dbc.from("registrations").select("prayer_unit_id"),
  ]);
  if (students.error) throw students.error;
  if (registrations.error) throw registrations.error;
  const used = new Map<string, number>();
  for (const r of [...students.data, ...registrations.data]) used.set(r.prayer_unit_id, (used.get(r.prayer_unit_id) ?? 0) + 1);
  return used;
}

/** For a form's drop-down: the active units, plus the record's current unit if it is no longer offered. */
export async function prayerUnitOptions(currentId?: string) {
  const units = await getPrayerUnits();
  return units.filter((u) => u.active || u.id === currentId).map(({ id, name }) => ({ id, name }));
}
