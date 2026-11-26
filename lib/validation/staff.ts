import { z } from "zod";
import { isoDate, optionalPassYear, optionalPhone, optionalText, requiredText, uuid } from "./common";

export const academicYearSchema = z.object({
  id: uuid.optional(),
  name: requiredText("Name", 40),
  start_date: isoDate,
  end_date: isoDate,
  is_current: z.boolean().optional(),
}).refine((v) => v.end_date > v.start_date, { message: "End date must be after start date.", path: ["end_date"] });

export const classSchema = z.object({
  id: uuid.optional(),
  name: requiredText("Class name", 60),
  section: optionalText("Section", 20),
  academic_year_id: uuid,
  teacher_ids: z.array(uuid).max(10).default([]),
});
export type ClassInput = z.input<typeof classSchema>;

export const createTeacherSchema = z.object({
  full_name: requiredText("Name"),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  phone: optionalPhone,
  twelfth_passed_year: optionalPassYear,
  class_ids: z.array(uuid).max(20).default([]),
});
export type CreateTeacherInput = z.input<typeof createTeacherSchema>;

export const createAdminSchema = z.object({
  full_name: requiredText("Name"),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

export const updateTeacherSchema = z.object({
  id: uuid,
  full_name: requiredText("Name"),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  phone: optionalPhone,
  twelfth_passed_year: optionalPassYear,
  class_ids: z.array(uuid).max(20).default([]),
});

export const teacherIdSchema = z.object({ id: uuid });
