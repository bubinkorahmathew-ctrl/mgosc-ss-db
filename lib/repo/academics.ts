import "server-only";
/** Academic years, classes (and their teachers), subjects and exams. Writes are admin only. */
import type { z } from "zod";
import { UserError } from "@/lib/user-error";
import type { academicYearSchema, classSchema } from "@/lib/validation/staff";
import type { createExamSchema, subjectSchema, updateExamSchema } from "@/lib/validation/academics";
import { queryAs, requireRole, type Viewer } from "./access";

const admin = (user: Viewer) => requireRole(user, "headmaster");

// ---------------------------------------------------------------------------
// Academic years and classes
// ---------------------------------------------------------------------------

export async function saveAcademicYear(user: Viewer, input: z.output<typeof academicYearSchema>): Promise<string> {
  admin(user);
  const { id, is_current, ...data } = input;
  const dbc = queryAs(user);
  const { data: row, error } = id
    ? await dbc.from("academic_years").update(data).eq("id", id).select("id").single()
    : await dbc.from("academic_years").insert(data).select("id").single();
  if (error) throw error;
  if (is_current) await setCurrentAcademicYear(user, row.id);
  return row.id;
}

export async function setCurrentAcademicYear(user: Viewer, yearId: string): Promise<void> {
  admin(user);
  const { error } = await queryAs(user).call((db) => db.setCurrentAcademicYear(yearId));
  if (error) throw error;
}

/** Creates or updates a class and sets exactly these teachers on it. */
export async function saveClass(user: Viewer, input: z.output<typeof classSchema>): Promise<string> {
  admin(user);
  const { id, teacher_ids, ...data } = input;
  const dbc = queryAs(user);

  // teachers must be existing, active teacher profiles
  if (teacher_ids.length) {
    const { data: t, error } = await dbc.from("profiles").select("id").in("id", teacher_ids).eq("role", "teacher").eq("active", true);
    if (error) throw error;
    if ((t ?? []).length !== new Set(teacher_ids).size) throw new UserError("One of the selected teachers is not available.");
  }

  const { data: row, error } = id
    ? await dbc.from("classes").update(data).eq("id", id).select("id").single()
    : await dbc.from("classes").insert(data).select("id").single();
  if (error) {
    if (/duplicate key/i.test(error.message)) throw new UserError("A class with that name already exists in this year.");
    throw error;
  }

  const { data: existing, error: e1 } = await dbc.from("class_teachers").select("teacher_id").eq("class_id", row.id);
  if (e1) throw e1;
  const have = new Set((existing ?? []).map((r) => r.teacher_id));
  const want = new Set(teacher_ids);
  const toRemove = [...have].filter((t) => !want.has(t));
  const toAdd = [...want].filter((t) => !have.has(t));
  if (toRemove.length) {
    const { error: e2 } = await dbc.from("class_teachers").delete().eq("class_id", row.id).in("teacher_id", toRemove);
    if (e2) throw e2;
  }
  if (toAdd.length) {
    const { error: e3 } = await dbc.from("class_teachers").insert(toAdd.map((t) => ({ class_id: row.id, teacher_id: t })));
    if (e3) throw e3;
  }
  return row.id;
}

/** Only an empty class (no students, exams or attendance) can be deleted. */
export async function deleteClass(user: Viewer, id: string): Promise<void> {
  admin(user);
  const dbc = queryAs(user);
  const [{ count: students }, { count: exams }, { count: att }] = await Promise.all([
    dbc.from("students").select("id", { count: "exact", head: true }).eq("class_id", id),
    dbc.from("exams").select("id", { count: "exact", head: true }).eq("class_id", id),
    dbc.from("attendance").select("id", { count: "exact", head: true }).eq("class_id", id),
  ]);
  if ((students ?? 0) > 0 || (exams ?? 0) > 0 || (att ?? 0) > 0) {
    throw new UserError("This class has students, exams or attendance. Move them first; classes with history cannot be deleted.");
  }
  const { error } = await dbc.from("classes").delete().eq("id", id);
  if (error) throw error;
}

/** The Classes page: a year's classes with teachers, active teachers, and students per class. */
export async function classesPage(user: Viewer, yearId: string | undefined) {
  const dbc = queryAs(user);
  const [{ data: classes }, { data: teachers }, { data: students }] = await Promise.all([
    yearId
      ? dbc.from("classes").select("id, name, section, academic_year_id, class_teachers(teacher_id, profiles(full_name))")
          .eq("academic_year_id", yearId).order("name")
      : Promise.resolve({ data: [] as never[] }),
    dbc.from("profiles").select("id, full_name").eq("role", "teacher").eq("active", true).order("full_name"),
    dbc.from("students").select("class_id").eq("status", "active"),
  ]);
  const counts = new Map<string, number>();
  for (const s of students ?? []) if (s.class_id) counts.set(s.class_id, (counts.get(s.class_id) ?? 0) + 1);
  return { classes: classes ?? [], teachers: teachers ?? [], counts };
}

// ---------------------------------------------------------------------------
// Subjects and exams
// ---------------------------------------------------------------------------

export async function saveSubject(user: Viewer, input: z.output<typeof subjectSchema>): Promise<string> {
  admin(user);
  const { id, ...data } = input;
  const dbc = queryAs(user);
  if (id) {
    // lowering the maximum must not make existing marks invalid
    const { data: top } = await dbc.from("marks").select("marks_obtained")
      .eq("subject_id", id).order("marks_obtained", { ascending: false }).limit(1);
    const highest = top?.[0] ? Number(top[0].marks_obtained) : 0;
    if (highest > data.max_marks) {
      throw new UserError(`Some students already have ${highest} marks in this subject. The maximum cannot be lower than that.`,
        { max_marks: [`At least ${highest}.`] });
    }
  }
  const { data: row, error } = id
    ? await dbc.from("subjects").update(data).eq("id", id).select("id").single()
    : await dbc.from("subjects").insert(data).select("id").single();
  if (error) {
    if (/duplicate key/i.test(error.message)) throw new UserError("A subject with that name already exists.", { name: ["Already exists."] });
    throw error;
  }
  return row.id;
}

/** Only a subject without marks can be deleted. */
export async function deleteSubject(user: Viewer, id: string): Promise<void> {
  admin(user);
  const dbc = queryAs(user);
  const { count } = await dbc.from("marks").select("id", { count: "exact", head: true }).eq("subject_id", id);
  if ((count ?? 0) > 0) throw new UserError(`This subject has ${count} marks entered, so it cannot be deleted.`);
  const { error } = await dbc.from("subjects").delete().eq("id", id);
  if (error) throw error;
}

/** One exam for each chosen class of the year; classes that already have it are skipped. */
export async function createExams(user: Viewer, input: z.output<typeof createExamSchema>): Promise<{ created: number; skipped: number }> {
  admin(user);
  const { class_ids, academic_year_id, name, exam_date } = input;
  const dbc = queryAs(user);
  const { data: classes, error: cErr } = await dbc.from("classes").select("id")
    .eq("academic_year_id", academic_year_id).in("id", class_ids);
  if (cErr) throw cErr;
  if ((classes ?? []).length !== new Set(class_ids).size) throw new UserError("Some classes are not in this academic year.");

  const { data: existing } = await dbc.from("exams").select("class_id").in("class_id", class_ids).ilike("name", name.replace(/[%_\\]/g, "\\$&"));
  const skip = new Set((existing ?? []).map((e) => e.class_id));
  const rows = [...new Set(class_ids)].filter((c) => !skip.has(c)).map((class_id) => ({ name, exam_date, class_id, academic_year_id }));
  if (!rows.length) throw new UserError(`“${name}” already exists for the selected classes.`);
  const { error } = await dbc.from("exams").insert(rows);
  if (error) throw error;
  return { created: rows.length, skipped: skip.size };
}

/** False if the exam isn't there (or not the user's to change). */
export async function updateExam(user: Viewer, input: z.output<typeof updateExamSchema>): Promise<boolean> {
  admin(user);
  const { id, ...data } = input;
  const { data: rows, error } = await queryAs(user).from("exams").update(data).eq("id", id).select("id");
  if (error) throw error;
  return !!rows?.length;
}

/** Deletes the exam with its marks. */
export async function deleteExam(user: Viewer, id: string): Promise<void> {
  admin(user);
  const { error } = await queryAs(user).from("exams").delete().eq("id", id);
  if (error) throw error;
}

/** The Subjects & Exams page: subjects, the year's classes, and its exams with how many marks each has. */
export async function examsPage(user: Viewer, yearId: string | undefined) {
  const dbc = queryAs(user);
  const [{ data: subjects }, { data: classes }, { data: exams }] = await Promise.all([
    dbc.from("subjects").select("id, name, max_marks, pass_percent, sort_order").order("sort_order").order("name"),
    yearId ? dbc.from("classes").select("id, name, section").eq("academic_year_id", yearId).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; section: string | null }[] }),
    yearId ? dbc.from("exams").select("id, name, exam_date, weight, class_id, marks(count)").eq("academic_year_id", yearId)
      .order("exam_date", { ascending: false, nullsFirst: false }).order("name")
      : Promise.resolve({ data: [] as never[] }),
  ]);
  return { subjects: subjects ?? [], classes: classes ?? [], exams: exams ?? [] };
}
