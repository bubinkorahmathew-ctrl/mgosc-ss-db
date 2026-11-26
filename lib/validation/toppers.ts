import { z } from "zod";
import { isoDate, uuid } from "./common";

/** A topper comparison, from the URL or the Assign button. Exactly what computeToppers takes. */
export const topperQuerySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exam"), classId: uuid, examId: uuid }),
  z.object({ kind: z.literal("annual"), classId: uuid, examIds: z.array(uuid).min(1, "Choose at least one exam.").max(20) }),
  z.object({ kind: z.literal("attendance"), classId: uuid, from: isoDate, to: isoDate })
    .refine((v) => v.from <= v.to, { message: "The period ends before it starts.", path: ["to"] }),
]);
export type TopperQueryInput = z.input<typeof topperQuerySchema>;

const pct = (label: string) => z.number({ error: `${label}: enter a number.` })
  .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(Math.round(v * 100) - v * 100) < 1e-6,
    `${label}: 0 to 100, at most 2 decimals.`);

export const gradeBandSchema = z.object({
  min_percent: pct("From"),
  max_percent: pct("To"),
  grade: z.string().trim().min(1, "Enter the grade.").max(8, "A grade is at most 8 characters.")
    .regex(/^[^<>\u0000-\u001f]+$/, "The grade contains characters that are not allowed."),
  grade_point: z.number().min(0).max(100).nullable().default(null),
  remark: z.string().trim().max(60, "A remark is at most 60 characters.").nullable().default(null)
    .transform((v) => v || null),
  is_pass: z.boolean(),
});
export const gradeScaleSchema = z.array(gradeBandSchema).min(1, "Add at least one grade.").max(20);
