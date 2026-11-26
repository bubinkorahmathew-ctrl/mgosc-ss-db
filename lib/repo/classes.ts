import "server-only";
import type { AcademicYearRow } from "@/lib/db/types";
import { classLabel } from "@/lib/format";
import { dbAs, queryAs, type Viewer } from "./access";

export { classLabel };
export type ClassOption = {
  id: string; label: string; academic_year_id: string; yearName: string; isCurrent: boolean; yearStart: string;
};

export async function getAcademicYears(user: Viewer): Promise<AcademicYearRow[]> {
  return dbAs(user).select("academic_years", { order: [{ column: "start_date", ascending: false }] });
}

/** Classes visible to the user (policies), current year first. */
export async function getClassOptions(user: Viewer, opts: { currentOnly?: boolean } = {}): Promise<ClassOption[]> {
  const db = dbAs(user);
  const [classes, years] = await Promise.all([
    db.select("classes", { order: [{ column: "name" }] }),
    db.select("academic_years"),
  ]);
  const yearById = new Map(years.map((y) => [y.id, y]));
  const rows = classes.flatMap((c) => {
    const year = yearById.get(c.academic_year_id);
    if (!year) return []; // inner join
    return [{
      id: c.id,
      label: classLabel(c),
      academic_year_id: c.academic_year_id,
      yearName: year.name,
      isCurrent: year.is_current,
      start: year.start_date,
    }];
  });
  const filtered = opts.currentOnly ? rows.filter((r) => r.isCurrent) : rows;
  filtered.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.start.localeCompare(a.start)
    || a.label.localeCompare(b.label, undefined, { numeric: true }));
  return filtered.map((r) => ({
    id: r.id, label: r.label, academic_year_id: r.academic_year_id, yearName: r.yearName, isCurrent: r.isCurrent,
    yearStart: r.start,
  }));
}

/** "Class 3 - A" for a class id, or "Class" if not visible. */
export async function classLabelFor(user: Viewer, classId: string): Promise<string> {
  const { data } = await queryAs(user).from("classes").select("name, section").eq("id", classId).maybeSingle();
  return data ? classLabel(data) : "Class";
}