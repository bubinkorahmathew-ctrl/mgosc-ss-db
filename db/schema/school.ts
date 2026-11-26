/** The school's structure: years, classes, teachers' classes, subjects, exams, settings, prayer units. */
import { sql } from "drizzle-orm";
import {
  boolean, char, check, date, decimal, index, int, json, mysqlTable, primaryKey, tinyint, uniqueIndex, varchar, text,
} from "drizzle-orm/mysql-core";
import { createdAt, id, ref, utc } from "./columns";
import { profiles } from "./people";

export const academicYears = mysqlTable("academic_years", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  /** NULL unless current, so the unique index allows at most one current year */
  currentKey: tinyint("current_key").generatedAlwaysAs(sql`if(\`is_current\`, 1, null)`, { mode: "virtual" }),
}, (t) => [
  uniqueIndex("academic_years_name_key").on(t.name),
  uniqueIndex("academic_years_one_current").on(t.currentKey),
  check("academic_years_dates_check", sql`${t.endDate} > ${t.startDate}`),
]);

export const classes = mysqlTable("classes", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  section: varchar("section", { length: 255 }),
  sectionKey: varchar("section_key", { length: 255 }).generatedAlwaysAs(sql`coalesce(\`section\`, '')`, { mode: "virtual" }),
  academicYearId: ref("academic_year_id").notNull().references(() => academicYears.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("classes_unique_name").on(t.academicYearId, t.name, t.sectionKey),
]);

export const classTeachers = mysqlTable("class_teachers", {
  classId: ref("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  teacherId: ref("teacher_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.classId, t.teacherId] }),
  index("class_teachers_teacher_idx").on(t.teacherId),
]);

export const subjects = mysqlTable("subjects", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  maxMarks: decimal("max_marks", { precision: 6, scale: 2, mode: "number" }).notNull().default(100),
  /** a subject is passed at or above this share of its maximum */
  passPercent: decimal("pass_percent", { precision: 5, scale: 2, mode: "number" }).notNull().default(40),
  sortOrder: int("sort_order").notNull().default(0),
}, (t) => [
  uniqueIndex("subjects_name_key").on(t.name),
  check("subjects_max_marks_check", sql`${t.maxMarks} > 0`),
  check("subjects_pass_percent_check", sql`${t.passPercent} between 0 and 100`),
]);

export const exams = mysqlTable("exams", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  classId: ref("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  academicYearId: ref("academic_year_id").notNull().references(() => academicYears.id, { onDelete: "restrict" }),
  examDate: date("exam_date", { mode: "string" }),
  /** weight in an annual result */
  weight: decimal("weight", { precision: 5, scale: 2, mode: "number" }).notNull().default(1),
  createdAt: createdAt(),
}, (t) => [
  index("exams_class_idx").on(t.classId),
  index("exams_academic_year_idx").on(t.academicYearId),
  check("exams_weight_check", sql`${t.weight} between 0 and 100`),
]);

export const prayerUnits = mysqlTable("prayer_units", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("prayer_units_name_key").on(t.name),
  check("prayer_units_name_check", sql`char_length(trim(${t.name})) > 0`),
]);

/** The single settings row (id 1). */
export const schoolSettings = mysqlTable("school_settings", {
  id: int("id").primaryKey().default(1),
  schoolName: varchar("school_name", { length: 255 }).notNull().default("Sunday School"),
  address: text("address"),
  logoUrl: text("logo_url"),
  headmasterName: text("headmaster_name"),
  vicarName: varchar("vicar_name", { length: 120 }),
  /** the Headmaster's signature */
  signatureUrl: text("signature_url"),
  vicarSignatureUrl: text("vicar_signature_url"),
  certificateWording: json("certificate_wording").$type<Record<string, string>>().notNull(),
  navIcons: json("nav_icons"),
  /** an attendance topper needs this % of the period's class days held */
  attendanceTopperMinPct: tinyint("attendance_topper_min_pct").notNull().default(50),
  /** IANA time zone for "today", class days and age: a Friday is a Friday here */
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Riyadh"),
  /** accounting: how amounts are shown (ISO code, e.g. SAR, and the symbol printed before them) */
  currencyCode: char("currency_code", { length: 3 }).notNull().default("SAR"),
  currencySymbol: varchar("currency_symbol", { length: 8 }).notNull().default("SAR"),
  updatedAt: utc("updated_at").notNull().default(sql`(current_timestamp(3))`).$onUpdate(() => new Date()),
}, (t) => [
  check("school_settings_one_row_check", sql`${t.id} = 1`),
  check("school_settings_topper_pct_check", sql`${t.attendanceTopperMinPct} between 0 and 100`),
]);

/** Gap-free yearly numbers (admission, certificate, ...), taken with SELECT ... FOR UPDATE. */
export const numberCounters = mysqlTable("number_counters", {
  /** admission, certificate, receipt, payment */
  name: varchar("name", { length: 20 }).notNull(),
  year: int("year").notNull(),
  lastValue: int("last_value").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.name, t.year] }),
]);

export const gradeScales = mysqlTable("grade_scales", {
  id: id(),
  minPercent: decimal("min_percent", { precision: 5, scale: 2, mode: "number" }).notNull(),
  maxPercent: decimal("max_percent", { precision: 5, scale: 2, mode: "number" }).notNull(),
  grade: varchar("grade", { length: 8 }).notNull(),
  gradePoint: decimal("grade_point", { precision: 4, scale: 2, mode: "number" }),
  remark: varchar("remark", { length: 60 }),
  isPass: boolean("is_pass").notNull().default(true),
}, (t) => [
  uniqueIndex("grade_scales_grade_key").on(t.grade),
  index("grade_scales_min_idx").on(t.minPercent),
  check("grade_scales_range_check", sql`${t.minPercent} between 0 and 100 and ${t.maxPercent} between 0 and 100 and ${t.minPercent} <= ${t.maxPercent}`),
]);

export type SchoolSettingsRow = typeof schoolSettings.$inferSelect;
