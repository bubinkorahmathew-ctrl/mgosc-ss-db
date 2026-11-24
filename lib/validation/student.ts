import { z } from "zod";
import { SCHOOL_CLASSES } from "@/lib/config";
import { isoDate, optionalText, personalFields, studentStatusEnum, uuid } from "./common";

/** Preset reasons offered when deactivating; anything else can be typed. */
export const INACTIVE_REASONS = ["Exit KSA", "Moved to another parish", "Discontinued"] as const;

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
export const setStudentStatusSchema = z.object({
  id: uuid, status: studentStatusEnum, inactive_reason: optionalText("Reason", 200),
}).refine((v) => v.status !== "inactive" || v.inactive_reason, {
  message: "Choose a reason.", path: ["inactive_reason"],
});
export const deleteStudentSchema = z.object({ id: uuid });

// ---------------------------------------------------------------------------------------------
// Filters, shared by the Students page and the Students report. Kept in the URL; a bad value is
// ignored rather than an error.
// ---------------------------------------------------------------------------------------------

const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const int = (min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional()).catch(undefined);
const maybe = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional()).catch(undefined);

export const STUDENT_SORTS = ["name", "age", "dob"] as const;

export const studentFiltersSchema = z.object({
  q: maybe(z.string().trim().max(100)),
  class_id: maybe(z.union([uuid, z.literal("none")])),
  school_class: maybe(z.enum(SCHOOL_CLASSES)),
  gender: maybe(z.enum(["male", "female"])),
  status: maybe(z.enum(["active", "inactive", "passed_out", "all"])),
  prayer_unit_id: maybe(uuid),
  age_min: int(0, 100),
  age_max: int(0, 100),
  /** age is worked out as on this date; default today */
  as_of: maybe(isoDate),
  dob_from: maybe(isoDate),
  dob_to: maybe(isoDate),
  dob_year: int(1990, 2100),
  dob_month: int(1, 12),
  incomplete: maybe(z.enum(["1"])),
  sort: maybe(z.enum(STUDENT_SORTS)),
  dir: maybe(z.enum(["asc", "desc"])),
  page: int(1, 10_000),
});
export type StudentFilters = z.infer<typeof studentFiltersSchema>;

/** URL keys of the filters (not sort or page), e.g. to tell whether any filter is set. */
export const STUDENT_FILTER_KEYS = [
  "q", "class_id", "school_class", "gender", "status", "prayer_unit_id", "age_min", "age_max", "as_of",
  "dob_from", "dob_to", "dob_year", "dob_month", "incomplete",
] as const;
