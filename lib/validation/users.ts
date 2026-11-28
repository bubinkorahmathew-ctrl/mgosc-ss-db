import { z } from "zod";
import { DESIGNATIONS, ROLES } from "@/lib/permissions";
import { optionalPassYear, optionalPhone, requiredText, uuid } from "./common";

/** A staff member from the Users page form (create or edit). */
export const personSchema = z.object({
  id: uuid.optional(),
  full_name: requiredText("Name"),
  // empty = a teacher profile without a login yet
  email: z.string().trim().toLowerCase().max(254).optional().nullable()
    .transform((v) => v || null)
    .pipe(z.email("Enter a valid email address.").nullable()),
  role: z.enum(ROLES).refine((r) => r !== "ovbs_teacher", "OVBS staff are added with the OVBS module."),
  designation: z.union([z.enum(DESIGNATIONS), z.literal(""), z.null()]).optional().transform((v) => v || null),
  phone: optionalPhone,
  twelfth_passed_year: optionalPassYear,
  // "YYYY-MM-DD": admin access lasts until the end of that day (Riyadh time); empty = permanent
  admin_access_until: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."), z.literal(""), z.null()]).optional()
    .transform((v) => (v ? new Date(`${v}T23:59:59.999+03:00`) : null)),
  active: z.boolean().default(true),
  classes: z.array(z.object({ class_id: uuid, is_class_teacher: z.boolean().default(false) })).max(30).default([]),
});
export type PersonFormInput = z.input<typeof personSchema>;
