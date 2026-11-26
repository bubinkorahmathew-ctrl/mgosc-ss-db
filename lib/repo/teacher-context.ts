import "server-only";
import { cookies } from "next/headers";
import { queryAs, type Viewer } from "./access";
import { classLabel } from "@/lib/format";

export type TeacherClass = { id: string; label: string; yearName: string; isCurrent: boolean };

/**
 * Classes assigned to the signed-in teacher (RLS: classes_teacher_select), current year first,
 * and the selected one: ?class= if it is one of theirs, else the first.
 */
export async function getTeacherClassContext(user: Viewer, requested?: string | string[]) {
  const dbc = queryAs(user);
  const { data } = await dbc
    .from("classes")
    .select("id, name, section, academic_years!inner(name, is_current, start_date)")
    .order("name");
  const classes: TeacherClass[] = (data ?? [])
    .sort((a, b) => Number(b.academic_years.is_current) - Number(a.academic_years.is_current)
      || b.academic_years.start_date.localeCompare(a.academic_years.start_date)
      || a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((c) => ({
      id: c.id,
      label: c.academic_years.is_current ? classLabel(c) : `${classLabel(c)} (${c.academic_years.name})`,
      yearName: c.academic_years.name,
      isCurrent: c.academic_years.is_current,
    }));
  const req = typeof requested === "string" ? requested : (await cookies()).get("ss_class")?.value;
  // only ever select a class the teacher actually has (RLS already filtered `classes`)
  const selected = classes.find((c) => c.id === req) ?? classes[0] ?? null;
  return { classes, selected };
}

/** Active students of a class, ordered by name (RLS applies). */
export async function getClassStudents(user: Viewer, classId: string) {
  const dbc = queryAs(user);
  const { data, error } = await dbc
    .from("students").select("id, admission_no, full_name, full_name_ml")
    .eq("class_id", classId).eq("status", "active").order("full_name");
  if (error) throw error;
  return data ?? [];
}
