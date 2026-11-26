import { z } from "zod";
import { isoDate, requiredText, uuid } from "./common";
import { todayISO } from "@/lib/dates";

export const certificateTypeEnum = z.enum([
  "completion", "merit", "attendance", "participation", "memory_verse", "custom", "class_topper", "attendance_topper",
]);

const SAFE_BODY = /^[^\u0000-\u0009\u000b-\u001f\u007f<>]*$/; // allow newlines

export const issueCertificatesSchema = z.object({
  type: certificateTypeEnum,
  class_id: uuid,
  student_ids: z.array(uuid).min(1, "Select at least one student.").max(200),
  title: requiredText("Title", 120),
  /** wording with {placeholders}; filled per student on the server */
  template: z.string().transform((s) => s.normalize("NFC").replace(/\r\n/g, "\n").trim())
    .pipe(z.string().min(1, "Wording is required.").max(1500, "Wording is too long.")
      .regex(SAFE_BODY, "Wording contains characters that are not allowed.")),
  exam_id: z.string().optional().nullable().transform((v) => v || null).pipe(uuid.nullable()),
  activity_id: z.string().optional().nullable().transform((v) => v || null).pipe(uuid.nullable()),
  /** class_topper / attendance_topper: the confirmed topper it is for */
  topper_id: z.string().optional().nullable().transform((v) => v || null).pipe(uuid.nullable()),
  issued_on: isoDate.refine((d) => d <= todayISO(), "Issue date cannot be in the future."),
}).superRefine((v, ctx) => {
  const topperType = v.type === "class_topper" || v.type === "attendance_topper";
  if (topperType && !v.topper_id) ctx.addIssue({ code: "custom", message: "Issue topper certificates from the Toppers page.", path: ["type"] });
  if (topperType && v.student_ids.length !== 1) ctx.addIssue({ code: "custom", message: "A topper certificate is for one student.", path: ["student_ids"] });
  if (!topperType && v.topper_id) ctx.addIssue({ code: "custom", message: "Only topper certificates name a topper.", path: ["topper_id"] });
  if (new Set(v.student_ids).size !== v.student_ids.length) ctx.addIssue({ code: "custom", message: "Duplicate student.", path: ["student_ids"] });
  if (v.type === "merit" && !v.exam_id) ctx.addIssue({ code: "custom", message: "Choose the exam for a merit certificate.", path: ["exam_id"] });
  if (v.type === "participation" && !v.activity_id) ctx.addIssue({ code: "custom", message: "Choose the activity.", path: ["activity_id"] });
});
export type IssueCertificatesInput = z.input<typeof issueCertificatesSchema>;

export const certificateIdsParam = z.string().max(200 * 37)
  .transform((s) => s.split(",").filter(Boolean))
  .pipe(z.array(uuid).min(1).max(200));
