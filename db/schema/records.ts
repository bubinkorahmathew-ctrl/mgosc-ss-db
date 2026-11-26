/** What happens in class: attendance, exam attendance, marks, activities, certificates, toppers. */
import { sql } from "drizzle-orm";
import {
  boolean, check, date, decimal, index, mysqlEnum, mysqlTable, text, uniqueIndex, varchar,
} from "drizzle-orm/mysql-core";
import { createdAt, id, ref, utc } from "./columns";
import { profiles, students } from "./people";
import { academicYears, classes, exams, subjects } from "./school";

const now = () => sql`(current_timestamp(3))`;

export const attendance = mysqlTable("attendance", {
  id: id(),
  studentId: ref("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  classId: ref("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ["present", "absent", "late"]).notNull(),
  remark: varchar("remark", { length: 200 }),
  markedBy: ref("marked_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: utc("updated_at").notNull().default(now()),
}, (t) => [
  uniqueIndex("attendance_student_date_key").on(t.studentId, t.date),
  index("attendance_class_date_idx").on(t.classId, t.date),
  index("attendance_marked_by_idx").on(t.markedBy),
]);

/** Who sat an exam. Absent students get no marks and no result. */
export const examAttendance = mysqlTable("exam_attendance", {
  id: id(),
  examId: ref("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentId: ref("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["present", "absent"]).notNull(),
  remark: varchar("remark", { length: 200 }),
  markedBy: ref("marked_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: utc("updated_at").notNull().default(now()),
}, (t) => [
  uniqueIndex("exam_attendance_unique").on(t.examId, t.studentId),
  index("exam_attendance_student_idx").on(t.studentId),
  index("exam_attendance_marked_by_idx").on(t.markedBy),
]);

export const marks = mysqlTable("marks", {
  id: id(),
  examId: ref("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentId: ref("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  subjectId: ref("subject_id").notNull().references(() => subjects.id, { onDelete: "restrict" }),
  marksObtained: decimal("marks_obtained", { precision: 6, scale: 2, mode: "number" }).notNull(),
  /** sat the exam but missed this subject: shown as AB, 0 marks */
  isAbsent: boolean("is_absent").notNull().default(false),
  remarks: text("remarks"),
  enteredBy: ref("entered_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: utc("updated_at").notNull().default(now()).$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("marks_exam_student_subject_key").on(t.examId, t.studentId, t.subjectId),
  index("marks_student_idx").on(t.studentId),
  index("marks_subject_idx").on(t.subjectId),
  index("marks_entered_by_idx").on(t.enteredBy),
  // the upper limit (the subject's maximum) is in another table: checked by the app
  check("marks_range_check", sql`${t.marksObtained} >= 0`),
  check("marks_absent_zero_check", sql`not ${t.isAbsent} or ${t.marksObtained} = 0`),
]);

export const activities = mysqlTable("activities", {
  id: id(),
  classId: ref("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  studentId: ref("student_id").references(() => students.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["competition", "memory_verse", "event", "note"]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  activityDate: date("activity_date", { mode: "string" }).notNull(),
  score: decimal("score", { precision: 8, scale: 2, mode: "number" }),
  notes: text("notes"),
  createdBy: ref("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  index("activities_class_idx").on(t.classId, t.activityDate),
  index("activities_student_idx").on(t.studentId),
  index("activities_created_by_idx").on(t.createdBy),
  check("activities_title_check", sql`char_length(trim(${t.title})) > 0`),
]);

/** Toppers the headmaster confirmed. exam_id is null for an annual or attendance topper. */
export const toppers = mysqlTable("toppers", {
  id: id(),
  classId: ref("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  academicYearId: ref("academic_year_id").notNull().references(() => academicYears.id, { onDelete: "restrict" }),
  examId: ref("exam_id").references(() => exams.id, { onDelete: "cascade" }),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  type: mysqlEnum("type", ["marks", "attendance"]).notNull(),
  studentId: ref("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  value: decimal("value", { precision: 6, scale: 2, mode: "number" }).notNull(),
  confirmedBy: ref("confirmed_by").references(() => profiles.id, { onDelete: "set null" }),
  confirmedAt: createdAt("confirmed_at"),
}, (t) => [
  index("toppers_class_idx").on(t.classId, t.type, t.periodStart),
  index("toppers_student_idx").on(t.studentId),
  index("toppers_exam_idx").on(t.examId),
  index("toppers_year_idx").on(t.academicYearId),
  index("toppers_confirmed_by_idx").on(t.confirmedBy),
  check("toppers_value_check", sql`${t.value} between 0 and 100`),
  check("toppers_period_check", sql`${t.periodEnd} >= ${t.periodStart}`),
]);

/** Issued certificates. Names, class and year are a snapshot taken at issue; never edited, only revoked. */
export const certificates = mysqlTable("certificates", {
  id: id(),
  certificateNo: varchar("certificate_no", { length: 32 }).notNull(),
  studentId: ref("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", [
    "completion", "merit", "attendance", "participation", "memory_verse", "custom", "class_topper", "attendance_topper",
  ]).notNull(),
  title: text("title").notNull(),
  bodyText: text("body_text").notNull(),
  academicYearId: ref("academic_year_id").notNull().references(() => academicYears.id, { onDelete: "restrict" }),
  examId: ref("exam_id").references(() => exams.id, { onDelete: "set null" }),
  activityId: ref("activity_id").references(() => activities.id, { onDelete: "set null" }),
  /** the confirmed topper a class_topper / attendance_topper certificate is for */
  topperId: ref("topper_id").references(() => toppers.id, { onDelete: "set null" }),
  studentName: varchar("student_name", { length: 120 }).notNull(),
  studentNameMl: varchar("student_name_ml", { length: 120 }),
  className: text("class_name").notNull(),
  classId: ref("class_id").references(() => classes.id, { onDelete: "set null" }),
  yearName: text("year_name").notNull(),
  classTeacherName: text("class_teacher_name"),
  issuedOn: date("issued_on", { mode: "string" }).notNull(),
  issuedBy: ref("issued_by").references(() => profiles.id, { onDelete: "set null" }),
  revoked: boolean("revoked").notNull().default(false),
  revokedAt: utc("revoked_at"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("certificates_no_key").on(t.certificateNo),
  index("certificates_student_idx").on(t.studentId),
  index("certificates_year_idx").on(t.academicYearId),
  index("certificates_exam_idx").on(t.examId),
  index("certificates_activity_idx").on(t.activityId),
  index("certificates_class_idx").on(t.classId),
  index("certificates_issued_by_idx").on(t.issuedBy),
]);
