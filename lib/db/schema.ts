/**
 * Column whitelist of db/migrations (replaced by db/schema + lib/repo in phase S3). Only names listed here can ever reach SQL as identifiers,
 * and every value is validated against its kind (see values.ts). A trailing "?" means nullable.
 */
import type {
  AcademicYearRow, ActivityRow, AttendanceRow, CertificateRow, ClassRow, ClassTeacherRow, ExamAttendanceRow, ExamRow, GradeScaleRow, MarkRow, TopperRow,
  NumberCounterRow, PrayerUnitRow, ProfileRow, RegistrationAttemptRow, RegistrationRow, SchoolSettingsRow, StudentRow, SubjectRow,
} from "@/lib/db/types";

export type Rows = {
  profiles: ProfileRow;
  academic_years: AcademicYearRow;
  classes: ClassRow;
  class_teachers: ClassTeacherRow;
  students: StudentRow;
  registrations: RegistrationRow;
  registration_attempts: RegistrationAttemptRow;
  subjects: SubjectRow;
  exams: ExamRow;
  marks: MarkRow;
  attendance: AttendanceRow;
  activities: ActivityRow;
  certificates: CertificateRow;
  school_settings: SchoolSettingsRow;
  number_counters: NumberCounterRow;
  prayer_units: PrayerUnitRow;
  exam_attendance: ExamAttendanceRow;
  grade_scales: GradeScaleRow;
  toppers: TopperRow;
};
export type TableName = keyof Rows;

type Base = "uuid" | "text" | "date" | "time" | "bool" | "number" | "int" | "json";
export type Kind = Base | `${Base}?` | readonly string[];

const personal = {
  full_name: "text", full_name_ml: "text?", dob: "date", gender: ["male", "female"],
  father_name: "text", mother_name: "text?", guardian_phone: "text", address: "text?",
  father_phone: "text", email: "text?",
  baptised: "bool", school_class: "text", school_name: "text?",
  prayer_group: "text?", prayer_unit_id: "uuid", baptism_name: "text?",
} as const;

export const COLUMNS: { [T in TableName]: { readonly [C in keyof Rows[T]]-?: Kind } } = {
  profiles: {
    id: "uuid", full_name: "text", phone: "text?", twelfth_passed_year: "int?", role: ["headmaster", "teacher"], active: "bool", created_at: "time",
  },
  academic_years: { id: "uuid", name: "text", start_date: "date", end_date: "date", is_current: "bool" },
  classes: { id: "uuid", name: "text", section: "text?", academic_year_id: "uuid", created_at: "time" },
  class_teachers: { class_id: "uuid", teacher_id: "uuid" },
  students: {
    id: "uuid", admission_no: "text", ...personal, photo_url: "text?",
    status: ["active", "inactive", "passed_out"], inactive_reason: "text?", class_id: "uuid?", created_at: "time",
  },
  registrations: {
    id: "uuid", ...personal, status: ["pending", "approved", "rejected"], submitted_at: "time",
    reviewed_by: "uuid?", reviewed_at: "time?", review_note: "text?", student_id: "uuid?",
  },
  registration_attempts: { id: "int", ip_hash: "text", created_at: "time" },
  subjects: { id: "uuid", name: "text", max_marks: "number", pass_percent: "number", sort_order: "int" },
  exams: {
    id: "uuid", name: "text", class_id: "uuid", academic_year_id: "uuid", exam_date: "date?", weight: "number", created_at: "time",
  },
  marks: {
    id: "uuid", exam_id: "uuid", student_id: "uuid", subject_id: "uuid", marks_obtained: "number", is_absent: "bool",
    remarks: "text?", entered_by: "uuid?", updated_at: "time",
  },
  attendance: {
    id: "uuid", student_id: "uuid", class_id: "uuid", date: "date", status: ["present", "absent", "late"],
    remark: "text?", marked_by: "uuid?", updated_at: "time",
  },
  exam_attendance: {
    id: "uuid", exam_id: "uuid", student_id: "uuid", status: ["present", "absent"], remark: "text?",
    marked_by: "uuid?", updated_at: "time",
  },
  activities: {
    id: "uuid", class_id: "uuid", student_id: "uuid?", type: ["competition", "memory_verse", "event", "note"],
    title: "text", activity_date: "date", score: "number?", notes: "text?", created_by: "uuid?", created_at: "time",
  },
  certificates: {
    id: "uuid", certificate_no: "text", student_id: "uuid",
    type: ["completion", "merit", "attendance", "participation", "memory_verse", "custom", "class_topper", "attendance_topper"],
    title: "text", body_text: "text", academic_year_id: "uuid", exam_id: "uuid?", activity_id: "uuid?", topper_id: "uuid?",
    student_name: "text", student_name_ml: "text?", class_name: "text", class_id: "uuid?", year_name: "text",
    class_teacher_name: "text?", issued_on: "date", issued_by: "uuid?", revoked: "bool", revoked_at: "time?",
    created_at: "time",
  },
  school_settings: {
    id: "int", school_name: "text", address: "text?", logo_url: "text?", headmaster_name: "text?", vicar_name: "text?",
    signature_url: "text?", vicar_signature_url: "text?", certificate_wording: "json", nav_icons: "json?",
    attendance_topper_min_pct: "int", timezone: "text", currency_code: "text", currency_symbol: "text", updated_at: "time",
  },
  number_counters: { name: "text", year: "int", last_value: "int" },
  prayer_units: { id: "uuid", name: "text", active: "bool", created_at: "time" },
  grade_scales: {
    id: "uuid", min_percent: "number", max_percent: "number", grade: "text", grade_point: "number?",
    remark: "text?", is_pass: "bool",
  },
  toppers: {
    id: "uuid", class_id: "uuid", academic_year_id: "uuid", exam_id: "uuid?", period_start: "date", period_end: "date",
    type: ["marks", "attendance"], student_id: "uuid", value: "number", confirmed_by: "uuid?", confirmed_at: "time",
  },
};

export const PRIMARY_KEY: Record<TableName, readonly string[]> = {
  profiles: ["id"], academic_years: ["id"], classes: ["id"], class_teachers: ["class_id", "teacher_id"],
  students: ["id"], registrations: ["id"], registration_attempts: ["id"], subjects: ["id"], exams: ["id"],
  marks: ["id"], attendance: ["id"], activities: ["id"], certificates: ["id"], school_settings: ["id"],
  number_counters: ["name", "year"], prayer_units: ["id"], exam_attendance: ["id"], grade_scales: ["id"], toppers: ["id"],
};

/** The only tables that accept upsert, with their conflict key. */
export const UPSERT_KEY = {
  attendance: ["student_id", "date"],
  marks: ["exam_id", "student_id", "subject_id"],
  exam_attendance: ["exam_id", "student_id"],
} as const;
