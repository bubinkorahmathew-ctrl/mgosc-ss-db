"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { uuid } from "@/lib/validation/common";
import { createExamSchema, subjectSchema, updateExamSchema } from "@/lib/validation/academics";
import * as academics from "@/lib/repo/academics";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateExams() {
  revalidatePath("/admin/exams");
  revalidatePath("/admin/report-cards");
  revalidatePath("/teacher/marks");
  revalidatePath("/teacher/reports");
}

export async function saveSubject(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertRole("headmaster");
    const data = subjectSchema.parse(input);
    const id = await academics.saveSubject(user, data);
    revalidateExams();
    return { ok: true, data: { id }, message: data.id ? "Subject updated." : "Subject added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteSubject(subjectId: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    await academics.deleteSubject(user, uuid.parse(subjectId));
    revalidateExams();
    return { ok: true, message: "Subject deleted." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createExams(input: unknown): Promise<ActionResult<{ created: number }>> {
  try {
    const user = await assertRole("headmaster");
    const { created, skipped } = await academics.createExams(user, createExamSchema.parse(input));
    revalidateExams();
    const note = skipped ? ` (skipped ${skipped} class${skipped === 1 ? "" : "es"} that already had it)` : "";
    return { ok: true, data: { created }, message: `Exam created for ${created} class${created === 1 ? "" : "es"}${note}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateExam(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    if (!(await academics.updateExam(user, updateExamSchema.parse(input)))) return { ok: false, error: "Exam not found." };
    revalidateExams();
    return { ok: true, message: "Exam updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteExam(examId: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    await academics.deleteExam(user, uuid.parse(examId));
    revalidateExams();
    return { ok: true, message: "Exam and its marks deleted." };
  } catch (e) {
    return toActionError(e);
  }
}
