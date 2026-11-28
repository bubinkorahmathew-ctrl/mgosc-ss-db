/** Staff accounts, students and the public registrations that become students. */
import { sql } from "drizzle-orm";
import {
  boolean, char, check, date, index, mysqlEnum, mysqlTable, smallint, text, uniqueIndex, varchar,
} from "drizzle-orm/mysql-core";
import { createdAt, id, ref, utc } from "./columns";
import { classes, prayerUnits } from "./school";

/** A staff member. Every login (users) has exactly one profile with the same id. */
export const profiles = mysqlTable("profiles", {
  id: char("id", { length: 36 }).primaryKey(),
  fullName: varchar("full_name", { length: 120 }).notNull(),
  phone: text("phone"),
  twelfthPassedYear: smallint("twelfth_passed_year"),
  /** permissions (lib/permissions.ts); ovbs_teacher is for the coming OVBS module */
  role: mysqlEnum("role", ["super_admin", "admin", "teacher", "ovbs_teacher"]).notNull().default("teacher"),
  /** official title, for display only (never a permission) */
  designation: mysqlEnum("designation", ["vicar", "hm", "assistant_hm", "acting_hm", "teacher", "technical_admin"]),
  /** temporary admin rights: with role admin, admin until this moment, then a teacher again; null = permanent */
  adminAccessUntil: utc("admin_access_until"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  /** receive notification emails (new registrations, new students in their class) */
  emailNotifications: boolean("email_notifications").notNull().default(true),
}, (t) => [
  check("profiles_full_name_check", sql`char_length(trim(${t.fullName})) > 0`),
]);

/** The login of a profile: email and password hash only. */
export const users = mysqlTable("users", {
  id: char("id", { length: 36 }).primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 254 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  passwordChangedAt: createdAt("password_changed_at"),
  /** set when an admin creates the login or resets the password: a new one is required at sign-in */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: utc("last_login_at"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("users_email_key").on(t.email),
]);

/** Name, date of birth and contacts: shared by students and registrations. */
const personal = () => ({
  fullName: varchar("full_name", { length: 120 }).notNull(),
  /** no longer asked for; kept so nothing is lost and certificate snapshots keep their shape */
  fullNameMl: varchar("full_name_ml", { length: 120 }),
  dob: date("dob", { mode: "string" }).notNull(),
  gender: mysqlEnum("gender", ["male", "female"]).notNull(),
  fatherName: text("father_name").notNull(),
  fatherPhone: varchar("father_phone", { length: 16 }).notNull(),
  motherName: text("mother_name"),
  guardianPhone: text("guardian_phone").notNull(),
  email: varchar("email", { length: 254 }),
  address: text("address"),
  /** replaced by baptism_name; kept */
  baptised: boolean("baptised").notNull().default(false),
  schoolClass: varchar("school_class", { length: 255 }).notNull(),
  schoolName: text("school_name"),
  /** old free text, replaced by prayer_unit_id; kept */
  prayerGroup: varchar("prayer_group", { length: 120 }),
  prayerUnitId: ref("prayer_unit_id").notNull().references(() => prayerUnits.id, { onDelete: "restrict" }),
  baptismName: varchar("baptism_name", { length: 120 }),
});

export const students = mysqlTable("students", {
  id: id(),
  admissionNo: varchar("admission_no", { length: 32 }).notNull(),
  ...personal(),
  photoUrl: text("photo_url"),
  status: mysqlEnum("status", ["active", "inactive", "passed_out"]).notNull().default("active"),
  inactiveReason: varchar("inactive_reason", { length: 200 }),
  classId: ref("class_id").references(() => classes.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("students_admission_no_key").on(t.admissionNo),
  index("students_class_idx").on(t.classId),
  index("students_dob_idx").on(t.dob),
  index("students_school_class_idx").on(t.schoolClass),
  index("students_status_idx").on(t.status),
  check("students_full_name_check", sql`char_length(trim(${t.fullName})) > 0`),
]);

export const registrations = mysqlTable("registrations", {
  id: id(),
  ...personal(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  submittedAt: createdAt("submitted_at"),
  reviewedBy: ref("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
  reviewedAt: utc("reviewed_at"),
  reviewNote: text("review_note"),
  studentId: ref("student_id").references(() => students.id, { onDelete: "set null" }),
}, (t) => [
  index("registrations_status_idx").on(t.status, t.submittedAt),
  index("registrations_reviewed_by_idx").on(t.reviewedBy),
  index("registrations_student_idx").on(t.studentId),
  check("registrations_full_name_check", sql`char_length(trim(${t.fullName})) > 0`),
]);
