/**
 * Database types for supabase-js. Mirrors supabase/migrations/*.sql.
 * Regenerate from a live project with:  npm run db:types
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};
type Table<Row, Required extends keyof Row, Relationships extends Rel[] = []> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

type R<name extends string, cols extends string, ref extends string> = {
  foreignKeyName: name;
  columns: [cols];
  isOneToOne: false;
  referencedRelation: ref;
  referencedColumns: ["id"];
};

export type UserRole = "headmaster" | "teacher";
export type Gender = "male" | "female";
export type StudentStatus = "active" | "inactive" | "passed_out";
export type RegistrationStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus = "present" | "absent" | "late";
export type ActivityType = "competition" | "memory_verse" | "event" | "note";
export type CertificateType =
  | "completion" | "merit" | "attendance" | "participation" | "memory_verse" | "custom";

export type ProfileRow = {
  id: string; full_name: string; phone: string | null; role: UserRole; active: boolean; created_at: string;
};
export type AcademicYearRow = {
  id: string; name: string; start_date: string; end_date: string; is_current: boolean;
};
export type ClassRow = {
  id: string; name: string; section: string | null; academic_year_id: string; created_at: string;
};
export type ClassTeacherRow = { class_id: string; teacher_id: string };
type PersonalFields = {
  full_name: string; full_name_ml: string | null; dob: string; gender: Gender;
  father_name: string | null; mother_name: string | null; guardian_phone: string;
  address: string | null; baptised: boolean; school_class: string; school_name: string | null;
};
export type StudentRow = PersonalFields & {
  id: string; admission_no: string; photo_url: string | null; status: StudentStatus;
  class_id: string | null; created_at: string;
};
export type RegistrationRow = PersonalFields & {
  id: string; status: RegistrationStatus; submitted_at: string; reviewed_by: string | null;
  reviewed_at: string | null; review_note: string | null; student_id: string | null;
};
export type RegistrationAttemptRow = { id: number; ip_hash: string; created_at: string };
export type SubjectRow = { id: string; name: string; max_marks: number; sort_order: number };
export type ExamRow = {
  id: string; name: string; class_id: string; academic_year_id: string; exam_date: string | null; created_at: string;
};
export type MarkRow = {
  id: string; exam_id: string; student_id: string; subject_id: string; marks_obtained: number;
  remarks: string | null; entered_by: string | null; updated_at: string;
};
export type AttendanceRow = {
  id: string; student_id: string; class_id: string; date: string; status: AttendanceStatus; marked_by: string | null;
};
export type ActivityRow = {
  id: string; class_id: string; student_id: string | null; type: ActivityType; title: string;
  activity_date: string; score: number | null; notes: string | null; created_by: string | null; created_at: string;
};
export type CertificateRow = {
  id: string; certificate_no: string; student_id: string; type: CertificateType; title: string;
  body_text: string; academic_year_id: string; exam_id: string | null; activity_id: string | null;
  student_name: string; student_name_ml: string | null; class_name: string; class_id: string | null;
  year_name: string; class_teacher_name: string | null; issued_on: string; issued_by: string | null;
  revoked: boolean; revoked_at: string | null; created_at: string;
};
export type SchoolSettingsRow = {
  id: number; school_name: string; address: string | null; logo_url: string | null;
  headmaster_name: string | null; signature_url: string | null;
  certificate_wording: Partial<Record<CertificateType, string>>; updated_at: string;
};
export type NumberCounterRow = { kind: "admission" | "certificate"; year: number; last_value: number };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id" | "full_name">;
      academic_years: Table<AcademicYearRow, "name" | "start_date" | "end_date">;
      classes: Table<ClassRow, "name" | "academic_year_id", [
        R<"classes_academic_year_id_fkey", "academic_year_id", "academic_years">,
      ]>;
      class_teachers: Table<ClassTeacherRow, "class_id" | "teacher_id", [
        R<"class_teachers_class_id_fkey", "class_id", "classes">,
        R<"class_teachers_teacher_id_fkey", "teacher_id", "profiles">,
      ]>;
      students: Table<StudentRow, "admission_no" | "full_name" | "dob" | "gender" | "guardian_phone" | "school_class", [
        R<"students_class_id_fkey", "class_id", "classes">,
      ]>;
      registrations: Table<RegistrationRow, "full_name" | "dob" | "gender" | "guardian_phone" | "school_class", [
        R<"registrations_reviewed_by_fkey", "reviewed_by", "profiles">,
        R<"registrations_student_id_fkey", "student_id", "students">,
      ]>;
      registration_attempts: Table<RegistrationAttemptRow, "ip_hash">;
      subjects: Table<SubjectRow, "name">;
      exams: Table<ExamRow, "name" | "class_id" | "academic_year_id", [
        R<"exams_class_id_fkey", "class_id", "classes">,
        R<"exams_academic_year_id_fkey", "academic_year_id", "academic_years">,
      ]>;
      marks: Table<MarkRow, "exam_id" | "student_id" | "subject_id" | "marks_obtained", [
        R<"marks_exam_id_fkey", "exam_id", "exams">,
        R<"marks_student_id_fkey", "student_id", "students">,
        R<"marks_subject_id_fkey", "subject_id", "subjects">,
        R<"marks_entered_by_fkey", "entered_by", "profiles">,
      ]>;
      attendance: Table<AttendanceRow, "student_id" | "class_id" | "date" | "status", [
        R<"attendance_student_id_fkey", "student_id", "students">,
        R<"attendance_class_id_fkey", "class_id", "classes">,
      ]>;
      activities: Table<ActivityRow, "class_id" | "type" | "title" | "activity_date", [
        R<"activities_class_id_fkey", "class_id", "classes">,
        R<"activities_student_id_fkey", "student_id", "students">,
        R<"activities_created_by_fkey", "created_by", "profiles">,
      ]>;
      // number, snapshots, year and issuer are filled by the certificates_insert trigger
      certificates: Table<CertificateRow, "student_id" | "type" | "title" | "body_text", [
        R<"certificates_student_id_fkey", "student_id", "students">,
        R<"certificates_academic_year_id_fkey", "academic_year_id", "academic_years">,
        R<"certificates_exam_id_fkey", "exam_id", "exams">,
        R<"certificates_activity_id_fkey", "activity_id", "activities">,
        R<"certificates_class_id_fkey", "class_id", "classes">,
        R<"certificates_issued_by_fkey", "issued_by", "profiles">,
      ]>;
      school_settings: Table<SchoolSettingsRow, never>;
      number_counters: Table<NumberCounterRow, "kind" | "year">;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_headmaster: { Args: Record<string, never>; Returns: boolean };
      is_teacher_of: { Args: { p_class_id: string }; Returns: boolean };
      my_class_ids: { Args: Record<string, never>; Returns: string[] };
      next_number: { Args: { p_kind: "admission" | "certificate"; p_year: number }; Returns: string };
      current_number_year: { Args: Record<string, never>; Returns: number };
      set_current_academic_year: { Args: { p_year_id: string }; Returns: undefined };
      approve_registration: { Args: { p_registration_id: string; p_class_id: string }; Returns: string };
      verify_certificate: {
        Args: { p_no: string };
        Returns: { valid: boolean; type: CertificateType; issued_on: string; student_name: string }[];
      };
    };
    Enums: {
      user_role: UserRole;
      gender: Gender;
      student_status: StudentStatus;
      registration_status: RegistrationStatus;
      attendance_status: AttendanceStatus;
      activity_type: ActivityType;
      certificate_type: CertificateType;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
