import { z } from "zod";
import { todayISO } from "@/lib/dates";
import { isoDate, optionalText, requiredText, uuid } from "./common";

export const attendanceStatusEnum = z.enum(["present", "absent", "late"]);

const remark = optionalText("Remark", 200);

export const saveAttendanceSchema = z.object({
  class_id: uuid,
  date: isoDate.refine((d) => d <= todayISO(), "Attendance cannot be marked for a future date."),
  entries: z.array(z.object({ student_id: uuid, status: attendanceStatusEnum, remark }))
    .min(1, "No students to save.").max(200),
}).refine((v) => new Set(v.entries.map((e) => e.student_id)).size === v.entries.length, "Duplicate student in list.");
export type SaveAttendanceInput = z.input<typeof saveAttendanceSchema>;

export const examAttendanceStatusEnum = z.enum(["present", "absent"]);

export const saveExamAttendanceSchema = z.object({
  exam_id: uuid,
  entries: z.array(z.object({ student_id: uuid, status: examAttendanceStatusEnum, remark }))
    .min(1, "No students to save.").max(200),
}).refine((v) => new Set(v.entries.map((e) => e.student_id)).size === v.entries.length, "Duplicate student in list.");

/** A missed subject: shown and typed as AB. */
export const ABSENT_MARK = "AB";

/** marks: number between 0 and 1000 with at most 2 decimals, "AB" (missed the subject), or null (= not entered) */
const markValue = z.union([z.number(), z.literal(ABSENT_MARK), z.null()])
  .refine((v) => v === null || v === ABSENT_MARK
    || (Number.isFinite(v) && v >= 0 && v <= 1000 && Math.round(v * 100) === v * 100),
  "Enter a valid mark.");

export const saveMarksSchema = z.object({
  exam_id: uuid,
  rows: z.array(z.object({
    student_id: uuid,
    marks: z.record(uuid, markValue),
  })).min(1).max(200),
});
export type SaveMarksInput = z.input<typeof saveMarksSchema>;

export const activityTypeEnum = z.enum(["competition", "memory_verse", "event", "note"]);

export const activitySchema = z.object({
  id: uuid.optional(),
  class_id: uuid,
  student_id: z.string().optional().nullable().transform((v) => v || null).pipe(uuid.nullable()),
  type: activityTypeEnum,
  title: requiredText("Title", 200),
  activity_date: isoDate,
  score: z.union([z.number(), z.null(), z.nan()]).optional()
    .transform((v) => (v == null || Number.isNaN(v) ? null : v))
    .pipe(z.number().min(0, "Score cannot be negative.").max(100000).nullable()),
  notes: optionalText("Notes", 1000),
});
export type ActivityInput = z.input<typeof activitySchema>;

export const ACTIVITY_LABELS: Record<z.infer<typeof activityTypeEnum>, string> = {
  competition: "Competition", memory_verse: "Memory verse", event: "Event", note: "Note",
};
