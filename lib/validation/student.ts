import { z } from "zod";
import { SCHOOL_CLASSES } from "@/lib/config";
import { personalFields, studentStatusEnum, uuid } from "./common";

const classIdOrNull = z.string().optional().nullable()
  .transform((v) => (v ? v : null))
  .pipe(uuid.nullable());

export const studentSchema = personalFields.extend({
  class_id: classIdOrNull,
  status: studentStatusEnum.default("active"),
});
export type StudentInput = z.input<typeof studentSchema>;

export const updateStudentSchema = studentSchema.extend({ id: uuid });

export const moveStudentSchema = z.object({ id: uuid, class_id: classIdOrNull });
export const setStudentStatusSchema = z.object({ id: uuid, status: studentStatusEnum });

/** Students list filters (from URL search params). */
export const studentFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  class_id: z.union([uuid, z.literal("none")]).optional().catch(undefined),
  school_class: z.enum(SCHOOL_CLASSES).optional().catch(undefined),
  gender: z.enum(["male", "female"]).optional().catch(undefined),
  status: z.enum(["active", "inactive", "passed_out", "all"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});
export type StudentFilters = z.infer<typeof studentFiltersSchema>;
