/**
 * Column whitelist of tidb/migrations. Only names listed here can ever reach SQL as identifiers,
 * and every value is validated against its kind (see values.ts). A trailing "?" means nullable.
 */
import type {
  AcademicYearRow, ActivityRow, AttendanceRow, CertificateRow, ClassRow, ClassTeacherRow, ExamRow, MarkRow,
  NumberCounterRow, ProfileRow, RegistrationAttemptRow, RegistrationRow, SchoolSettingsRow, StudentRow, SubjectRow,
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
};
export type TableName = keyof Rows;

type Base = "uuid" | "text" | "date" | "time" | "bool" | "number" | "int" | "json";
export type Kind = Base | `${Base}?` | readonly string[];

const personal = {
  full_name: "text", full_name_ml: "text?", dob: "date", gender: ["male", "female"],
  father_name: "text?", mother_name: "text?", guardian_phone: "text", address: "text?",
  baptised: "bool", school_class: "text", school_name: "text?",
  prayer_group: "text?",
} as const;

export const COLUMNS: { [T in TableName]: { readonly [C in keyof Rows[T]]-?: Kind } } = {
  profiles: {
    id: "uuid", full_name: "text", phone: "text?", role: ["headmaster", "teacher"], active: "bool", created_at: "time",
  },
  academic_years: { id: "uuid", name: "text", start_date: "date", end_date: "date", is_current: "bool" },
  classes: { id: "uuid", name: "text", section: "text?", academic_year_id: "uuid", created_at: "time" },
  class_teachers: { class_id: "uuid", teacher_id: "uuid" },
  students: {
    id: "uuid", admission_no: "text", ...personal, photo_url: "text?",
    status: ["active", "inactive", "passed_out"], class_id: "uuid?", created_at: "time",
  },
  registrations: {
    id: "uuid", ...personal, status: ["pending", "approved", "rejected"], submitted_at: "time",
    reviewed_by: "uuid?", reviewed_at: "time?", review_note: "text?", student_id: "uuid?",
  },
  registration_attempts: { id: "int", ip_hash: "text", created_at: "time" },
  subjects: { id: "uuid", name: "text", max_marks: "number", sort_order: "int" },
  exams: { id: "uuid", name: "text", class_id: "uuid", academic_year_id: "uuid", exam_date: "date?", created_at: "time" },
  marks: {
    id: "uuid", exam_id: "uuid", student_id: "uuid", subject_id: "uuid", marks_obtained: "number",
    remarks: "text?", entered_by: "uuid?", updated_at: "time",
  },
  attendance: {
    id: "uuid", student_id: "uuid", class_id: "uuid", date: "date", status: ["present", "absent", "late"], marked_by: "uuid?",
  },
  activities: {
    id: "uuid", class_id: "uuid", student_id: "uuid?", type: ["competition", "memory_verse", "event", "note"],
    title: "text", activity_date: "date", score: "number?", notes: "text?", created_by: "uuid?", created_at: "time",
  },
  certificates: {
    id: "uuid", certificate_no: "text", student_id: "uuid",
    type: ["completion", "merit", "attendance", "participation", "memory_verse", "custom"],
    title: "text", body_text: "text", academic_year_id: "uuid", exam_id: "uuid?", activity_id: "uuid?",
    student_name: "text", student_name_ml: "text?", class_name: "text", class_id: "uuid?", year_name: "text",
    class_teacher_name: "text?", issued_on: "date", issued_by: "uuid?", revoked: "bool", revoked_at: "time?",
    created_at: "time",
  },
  school_settings: {
    id: "int", school_name: "text", address: "text?", logo_url: "text?", headmaster_name: "text?",
    signature_url: "text?", certificate_wording: "json", updated_at: "time",
  },
  number_counters: { kind: ["admission", "certificate"], year: "int", last_value: "int" },
};

export const PRIMARY_KEY: Record<TableName, readonly string[]> = {
  profiles: ["id"], academic_years: ["id"], classes: ["id"], class_teachers: ["class_id", "teacher_id"],
  students: ["id"], registrations: ["id"], registration_attempts: ["id"], subjects: ["id"], exams: ["id"],
  marks: ["id"], attendance: ["id"], activities: ["id"], certificates: ["id"], school_settings: ["id"],
  number_counters: ["kind", "year"],
};

/** The only tables that accept upsert, with their conflict key. */
export const UPSERT_KEY = {
  attendance: ["student_id", "date"],
  marks: ["exam_id", "student_id", "subject_id"],
} as const;
