import { z } from "zod";
import { isoDate, optionalText, requiredText, uuid } from "./common";

const maxMarks = z.number({ error: "Enter the maximum marks." })
  .refine((v) => Number.isFinite(v) && v > 0 && v <= 1000 && Math.round(v * 100) === v * 100,
    "Maximum marks must be between 0 and 1000 (up to 2 decimals).");

export const subjectSchema = z.object({
  id: uuid.optional(),
  name: requiredText("Subject name", 80),
  max_marks: maxMarks,
  sort_order: z.number().int().min(0).max(999).default(0),
});
export type SubjectInput = z.input<typeof subjectSchema>;

const examDate = z.string().optional().nullable().transform((v) => v || null).pipe(isoDate.nullable());

/** Create the same exam for one or more classes of one academic year. */
export const createExamSchema = z.object({
  name: requiredText("Exam name", 80),
  exam_date: examDate,
  academic_year_id: uuid,
  class_ids: z.array(uuid).min(1, "Select at least one class.").max(50),
});
export type CreateExamInput = z.input<typeof createExamSchema>;

export const updateExamSchema = z.object({
  id: uuid,
  name: requiredText("Exam name", 80),
  exam_date: examDate,
});

export const promotionSchema = z.object({
  from_class_id: uuid,
  /** a class id, or "passed_out" to mark students as passed out */
  target: z.union([z.literal("passed_out"), uuid]),
  student_ids: z.array(uuid).min(1, "Tick at least one student.").max(300),
}).refine((v) => v.target !== v.from_class_id, { message: "Choose a different class.", path: ["target"] });
export type PromotionInput = z.input<typeof promotionSchema>;

export const settingsSchema = z.object({
  school_name: requiredText("School name", 120),
  address: optionalText("Address", 300),
  headmaster_name: optionalText("Headmaster name", 120),
  certificate_wording: z.object({
    completion: optionalText("Wording", 1000),
    merit: optionalText("Wording", 1000),
    attendance: optionalText("Wording", 1000),
    participation: optionalText("Wording", 1000),
    memory_verse: optionalText("Wording", 1000),
    custom: optionalText("Wording", 1000),
  }),
});
export type SettingsInput = z.input<typeof settingsSchema>;

/** Only images inside our own public "branding" bucket can be saved as logo/signature. */
export const brandingImageSchema = z.object({
  kind: z.enum(["logo", "signature"]),
  url: z.string().nullable(),
});
