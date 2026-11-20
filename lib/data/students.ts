import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { StudentFilters } from "@/lib/validation/student";

export const STUDENTS_PAGE_SIZE = 50;

/** Strip characters that have meaning in PostgREST filter strings. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Students list for the caller (RLS limits teachers to their classes). */
export async function listStudents(f: StudentFilters) {
  const supabase = await createClient();
  const page = f.page ?? 1;
  let query = supabase
    .from("students")
    .select("id, admission_no, full_name, full_name_ml, dob, gender, school_class, guardian_phone, status, class_id, classes(name, section)",
      { count: "exact" })
    .order("full_name");

  const status = f.status ?? "active";
  if (status !== "all") query = query.eq("status", status);
  if (f.class_id === "none") query = query.is("class_id", null);
  else if (f.class_id) query = query.eq("class_id", f.class_id);
  if (f.school_class) query = query.eq("school_class", f.school_class);
  if (f.gender) query = query.eq("gender", f.gender);
  if (f.q) {
    const q = sanitizeSearch(f.q);
    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `full_name.ilike.${like},full_name_ml.ilike.${like},admission_no.ilike.${like},guardian_phone.ilike.${like}`,
      );
    }
  }
  const from = (page - 1) * STUDENTS_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + STUDENTS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / STUDENTS_PAGE_SIZE)) };
}
