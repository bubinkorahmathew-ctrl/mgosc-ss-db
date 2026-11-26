"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import {
  activePrayerUnits, insertStudents, loadClass, loadExam, studentsBornOn, upsertAttendance, upsertMarks,
} from "@/lib/repo/import";
import {
  markExistingStudents, parseAttendance, parseMarks, parseStudents, studentKey, type ImportReport,
} from "@/lib/import/parse";
import { readSheet, SheetError } from "@/lib/import/sheet";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { uuid } from "@/lib/validation/common";

/**
 * Bulk upload. "check" only reports; "save" checks the same file again and saves every row in one
 * transaction, or nothing at all. Rights are those of the manual screens: admins anywhere,
 * teachers in their own classes (enforced again by the data layer).
 */
const form = z.object({ mode: z.enum(["check", "save"]), target: z.string() });

async function upload(formData: FormData) {
  const { mode, target } = form.parse({ mode: formData.get("mode"), target: formData.get("target") ?? "" });
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new SheetError("Choose an Excel file to upload.");
  const sheet = await readSheet(new Uint8Array(await file.arrayBuffer()));
  return { mode, target, sheet };
}

function failed(e: unknown): { ok: false; error: string } {
  if (e instanceof SheetError) return { ok: false, error: e.message };
  return toActionError(e);
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function finish(report: ImportReport, mode: "check" | "save", one: string, many: string): ActionResult<ImportReport> {
  if (report.fileErrors.length || report.problems) {
    return { ok: true, data: report, message: "Please fix the problems in the file and upload it again." };
  }
  if (!report.ready) return { ok: true, data: report, message: `There is nothing new to save.` };
  return { ok: true, data: report, message: mode === "check" ? `${count(report.ready, one, many)} ready to save.` : undefined };
}

const canSave = (report: ImportReport) => !report.fileErrors.length && !report.problems && report.ready > 0;

export async function importStudents(formData: FormData): Promise<ActionResult<ImportReport>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const { mode, target, sheet } = await upload(formData);
    let classId: string | null = null;
    if (target) {
      const cls = await loadClass(user, uuid.parse(target));
      if (user.profile.role === "teacher" && !cls.isCurrent) {
        throw new AuthError("Teachers can add students only to a class of the current year.");
      }
      classId = cls.id;
    } else if (user.profile.role === "teacher") {
      throw new AuthError("Choose one of your classes.");
    }

    let parsed = parseStudents(sheet, await activePrayerUnits(user));
    if (parsed.students.length) {
      const same = await studentsBornOn(user, [...new Set(parsed.students.map((s) => s.data.dob))]);
      parsed = markExistingStudents(parsed, new Map(same.map((s) => [studentKey(s.full_name, s.dob), s.admission_no])));
    }
    if (mode === "check" || !canSave(parsed.report)) return finish(parsed.report, mode, "student", "students");

    const rows = await insertStudents(user, parsed.students.map((s) => s.data), classId);
    revalidatePath("/admin/students");
    revalidatePath("/admin");
    revalidatePath("/teacher/students");
    revalidatePath("/teacher");
    const report = { ...parsed.report, saved: rows.length };
    const first = rows[0]?.admission_no, last = rows.at(-1)?.admission_no;
    return { ok: true, data: report, message: `${count(rows.length, "student", "students")} added${first ? ` (${first}${last !== first ? ` to ${last}` : ""})` : ""}.` };
  } catch (e) {
    return failed(e);
  }
}

export async function importMarks(formData: FormData): Promise<ActionResult<ImportReport>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const { mode, target, sheet } = await upload(formData);
    const exam = await loadExam(user, uuid.parse(target));
    if (!exam.subjects.length) throw new SheetError("No subjects have been set up yet.");
    const parsed = parseMarks(sheet, { subjects: exam.subjects, students: exam.students, existing: exam.saved });
    if (mode === "check" || !canSave(parsed.report)) return finish(parsed.report, mode, "student's marks are", "students' marks are");

    const rows = await upsertMarks(user, exam.id, parsed.entries);
    revalidatePath("/teacher/marks");
    revalidatePath("/admin/exams");
    revalidatePath("/admin/report-cards");
    return { ok: true, data: { ...parsed.report, saved: rows.length }, message: `${count(rows.length, "mark", "marks")} saved for ${count(parsed.report.ready, "student", "students")}.` };
  } catch (e) {
    return failed(e);
  }
}

export async function importAttendance(formData: FormData): Promise<ActionResult<ImportReport>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const { mode, target, sheet } = await upload(formData);
    const cls = await loadClass(user, uuid.parse(target));
    const parsed = parseAttendance(sheet, { students: cls.students, today: todayISO() });
    if (mode === "check" || !canSave(parsed.report)) return finish(parsed.report, mode, "student's attendance is", "students' attendance is");

    const rows = await upsertAttendance(user, cls.id, parsed.entries);
    revalidatePath("/teacher/attendance");
    revalidatePath("/teacher");
    revalidatePath("/admin");
    const days = new Set(parsed.entries.map((e) => e.date)).size;
    return { ok: true, data: { ...parsed.report, saved: rows.length }, message: `Attendance saved: ${count(rows.length, "entry", "entries")} over ${count(days, "day", "days")}.` };
  } catch (e) {
    return failed(e);
  }
}
