"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { assertRole } from "@/lib/auth";
import { uuid } from "@/lib/validation/common";
import { createExamSchema, subjectSchema, updateExamSchema } from "@/lib/validation/academics";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateExams() {
  revalidatePath("/admin/exams");
  revalidatePath("/admin/report-cards");
  revalidatePath("/teacher/marks");
  revalidatePath("/teacher/reports");
}

export async function saveSubject(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole("headmaster");
    const { id, ...data } = subjectSchema.parse(input);
    const dbc = await createClient();

    if (id) {
      // lowering the maximum must not make existing marks invalid
      const { data: top } = await dbc.from("marks").select("marks_obtained")
        .eq("subject_id", id).order("marks_obtained", { ascending: false }).limit(1);
      const highest = top?.[0] ? Number(top[0].marks_obtained) : 0;
      if (highest > data.max_marks) {
        return { ok: false, error: `Some students already have ${highest} marks in this subject. The maximum cannot be lower than that.`,
          fieldErrors: { max_marks: [`At least ${highest}.`] } };
      }
    }
    const { data: row, error } = id
      ? await dbc.from("subjects").update(data).eq("id", id).select("id").single()
      : await dbc.from("subjects").insert(data).select("id").single();
    if (error) {
      if (/duplicate key/i.test(error.message)) return { ok: false, error: "A subject with that name already exists.", fieldErrors: { name: ["Already exists."] } };
      throw error;
    }
    revalidateExams();
    return { ok: true, data: { id: row.id }, message: id ? "Subject updated." : "Subject added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteSubject(subjectId: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const id = uuid.parse(subjectId);
    const dbc = await createClient();
    const { count } = await dbc.from("marks").select("id", { count: "exact", head: true }).eq("subject_id", id);
    if ((count ?? 0) > 0) return { ok: false, error: `This subject has ${count} marks entered, so it cannot be deleted.` };
    const { error } = await dbc.from("subjects").delete().eq("id", id);
    if (error) throw error;
    revalidateExams();
    return { ok: true, message: "Subject deleted." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createExams(input: unknown): Promise<ActionResult<{ created: number }>> {
  try {
    await assertRole("headmaster");
    const { class_ids, academic_year_id, name, exam_date } = createExamSchema.parse(input);
    const dbc = await createClient();

    const { data: classes, error: cErr } = await dbc.from("classes").select("id")
      .eq("academic_year_id", academic_year_id).in("id", class_ids);
    if (cErr) throw cErr;
    if ((classes ?? []).length !== new Set(class_ids).size) return { ok: false, error: "Some classes are not in this academic year." };

    const { data: existing } = await dbc.from("exams").select("class_id").in("class_id", class_ids).ilike("name", name.replace(/[%_\\]/g, "\\$&"));
    const skip = new Set((existing ?? []).map((e) => e.class_id));
    const rows = [...new Set(class_ids)].filter((c) => !skip.has(c))
      .map((class_id) => ({ name, exam_date, class_id, academic_year_id }));
    if (!rows.length) return { ok: false, error: `“${name}” already exists for the selected classes.` };

    const { error } = await dbc.from("exams").insert(rows);
    if (error) throw error;
    revalidateExams();
    const note = skip.size ? ` (skipped ${skip.size} class${skip.size === 1 ? "" : "es"} that already had it)` : "";
    return { ok: true, data: { created: rows.length }, message: `Exam created for ${rows.length} class${rows.length === 1 ? "" : "es"}${note}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateExam(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id, ...data } = updateExamSchema.parse(input);
    const dbc = await createClient();
    const { data: rows, error } = await dbc.from("exams").update(data).eq("id", id).select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "Exam not found." };
    revalidateExams();
    return { ok: true, message: "Exam updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteExam(examId: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const id = uuid.parse(examId);
    const dbc = await createClient();
    const { error } = await dbc.from("exams").delete().eq("id", id);
    if (error) throw error;
    revalidateExams();
    return { ok: true, message: "Exam and its marks deleted." };
  } catch (e) {
    return toActionError(e);
  }
}
