/**
 * Read-only views. Their SQL is in db/migrations (custom migrations), so drizzle-kit does not
 * manage them (`.existing()`); these declarations only give typed reads.
 */
import { bigint, char, date, decimal, mysqlView, varchar } from "drizzle-orm/mysql-core";

/** Age in completed years and months, as on today in the school's time zone. */
export const vStudentAge = mysqlView("v_student_age", {
  id: char("id", { length: 36 }),
  dob: date("dob", { mode: "string" }),
  ageYears: bigint("age_years", { mode: "number" }),
  ageMonths: bigint("age_months", { mode: "number" }),
}).existing();

/** One row per subject a student sat: percentage, grade, passed. */
export const vSubjectResults = mysqlView("v_subject_results", {
  examId: char("exam_id", { length: 36 }),
  studentId: char("student_id", { length: 36 }),
  subjectId: char("subject_id", { length: 36 }),
  marksObtained: decimal("marks_obtained", { precision: 6, scale: 2, mode: "number" }),
  subjectPercent: decimal("subject_percent", { precision: 11, scale: 2, mode: "number" }),
  grade: varchar("grade", { length: 8 }),
  passed: bigint("passed", { mode: "number" }),
}).existing();

/** One row per student per exam: totals, percentage, overall grade, result and RANK(). */
export const vExamResults = mysqlView("v_exam_results", {
  examId: char("exam_id", { length: 36 }),
  studentId: char("student_id", { length: 36 }),
  examStatus: varchar("exam_status", { length: 8 }),
  totalObtained: decimal("total_obtained", { precision: 28, scale: 2, mode: "number" }),
  totalMax: decimal("total_max", { precision: 28, scale: 2, mode: "number" }),
  subjectsEntered: bigint("subjects_entered", { mode: "number" }),
  percentage: decimal("percentage", { precision: 33, scale: 2, mode: "number" }),
  overallGrade: varchar("overall_grade", { length: 8 }),
  result: varchar("result", { length: 6 }),
  classRank: bigint("class_rank", { mode: "number" }),
}).existing();
