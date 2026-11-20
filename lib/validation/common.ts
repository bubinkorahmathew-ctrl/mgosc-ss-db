import { z } from "zod";
import { SCHOOL_CLASSES } from "@/lib/config";
import { todayISO } from "@/lib/dates";

/** Normalise to NFC (important for Malayalam) and collapse whitespace. */
const clean = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
// Disallow control characters and angle brackets; everything else (incl. Malayalam) is fine.
const SAFE_TEXT = /^[^\u0000-\u001f\u007f<>]*$/;

// z.guid(): any 8-4-4-4-12 hex id, as Postgres accepts (z.uuid() rejects the seed's fixed ids).
export const uuid = z.guid("Invalid id.");

export const requiredText = (label: string, max = 120) =>
  z.string({ error: `${label} is required.` })
    .transform(clean)
    .pipe(z.string().min(1, `${label} is required.`).max(max, `${label} is too long.`)
      .regex(SAFE_TEXT, `${label} contains characters that are not allowed.`));

export const optionalText = (label: string, max = 200) =>
  z.string().optional().nullable()
    .transform((v) => (v == null ? null : clean(v) || null))
    .pipe(z.string().max(max, `${label} is too long.`)
      .regex(SAFE_TEXT, `${label} contains characters that are not allowed.`).nullable());

/** Malayalam script only (plus spaces, dots, ZWJ/ZWNJ). Empty -> null. */
export const malayalamName = z.string().optional().nullable()
  .transform((v) => (v == null ? null : clean(v) || null))
  .pipe(z.string().max(120, "Name is too long.")
    .regex(/^[ഀ-ൿ‌‍ .]+$/, "Please type the name using Malayalam letters.")
    .nullable());

/** Indian mobile/landline: 10-15 digits, optional +, spaces or dashes allowed. Stored as digits (+ kept). */
export const phone = z.string({ error: "Phone number is required." })
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\+?\d{10,15}$/, "Enter a valid phone number (10 digits)."));

export const optionalPhone = z.string().optional().nullable()
  .transform((v) => (v ? v.replace(/[\s-]/g, "") : null))
  .pipe(z.string().regex(/^\+?\d{10,15}$/, "Enter a valid phone number (10 digits).").nullable());

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Enter a valid date.");

export const dob = isoDate
  .refine((s) => s <= todayISO(), "Date of birth cannot be in the future.")
  .refine((s) => s >= "1990-01-01", "Please check the date of birth.");

export const genderEnum = z.enum(["male", "female"], { error: "Select gender." });
export const studentStatusEnum = z.enum(["active", "inactive", "passed_out"]);

export const schoolClass = z.enum(SCHOOL_CLASSES, { error: "Select the school class." });

/** Checkbox / "on" / "true" -> boolean */
export const boolish = z.union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "true" || v === "on" || v === "yes");

/** The personal fields shared by registrations and students. */
export const personalFields = z.object({
  full_name: requiredText("Child's name"),
  full_name_ml: malayalamName,
  dob,
  gender: genderEnum,
  father_name: optionalText("Father's name", 120),
  mother_name: optionalText("Mother's name", 120),
  guardian_phone: phone,
  address: optionalText("Address", 500),
  baptised: boolish,
  school_class: schoolClass,
  school_name: optionalText("School name", 160),
});
export type PersonalFields = z.output<typeof personalFields>;
export type PersonalFieldsInput = z.input<typeof personalFields>;
