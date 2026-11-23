import "server-only";
import { getUserDb } from "@/lib/auth";
import type { AcademicYearRow } from "@/lib/db/types";
import { classLabel } from "@/lib/format";

export { classLabel };
export type ClassOption = {
  id: string; label: string; academic_year_id: string; yearName: string; isCurrent: boolean; yearStart: string;
};

export async function getAcademicYears(): Promise<AcademicYearRow[]> {
  const db = await getUserDb();
  return db.select("academic_years", { order: [{ column: "start_date", ascending: false }] });
}

/** Classes visible to the caller (policies), current year first. */
export async function getClassOptions(opts: { currentOnly?: boolean } = {}): Promise<ClassOption[]> {
  const db = await getUserDb();
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
