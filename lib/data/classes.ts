import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AcademicYearRow } from "@/lib/supabase/types";
import { classLabel } from "@/lib/format";

export { classLabel };
export type ClassOption = {
  id: string; label: string; academic_year_id: string; yearName: string; isCurrent: boolean; yearStart: string;
};

export async function getAcademicYears(): Promise<AcademicYearRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("academic_years").select("*").order("start_date", { ascending: false });
  return data ?? [];
}

/** Classes visible to the caller (RLS), current year first. */
export async function getClassOptions(opts: { currentOnly?: boolean } = {}): Promise<ClassOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("id, name, section, academic_year_id, academic_years!inner(name, is_current, start_date)")
    .order("name");
  const rows = (data ?? []).map((c) => ({
    id: c.id,
    label: classLabel(c),
    academic_year_id: c.academic_year_id,
    yearName: c.academic_years.name,
    isCurrent: c.academic_years.is_current,
    start: c.academic_years.start_date,
  }));
  const filtered = opts.currentOnly ? rows.filter((r) => r.isCurrent) : rows;
  filtered.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.start.localeCompare(a.start)
    || a.label.localeCompare(b.label, undefined, { numeric: true }));
  return filtered.map((r) => ({
    id: r.id, label: r.label, academic_year_id: r.academic_year_id, yearName: r.yearName, isCurrent: r.isCurrent,
    yearStart: r.start,
  }));
}
