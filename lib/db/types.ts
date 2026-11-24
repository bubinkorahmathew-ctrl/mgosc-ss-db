/** Row types. Mirrors tidb/migrations/*.sql. */
export type UserRole = "headmaster" | "teacher";
export type Gender = "male" | "female";
export type StudentStatus = "active" | "inactive" | "passed_out";
export type RegistrationStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus = "present" | "absent" | "late";
export type ActivityType = "competition" | "memory_verse" | "event" | "note";
export type CertificateType =
  | "completion" | "merit" | "attendance" | "participation" | "memory_verse" | "custom";

export type ProfileRow = {
  id: string; full_name: string; phone: string | null; twelfth_passed_year: number | null;
  role: UserRole; active: boolean; created_at: string;
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
  father_name: string; mother_name: string | null; guardian_phone: string;
  address: string | null; baptised: boolean; school_class: string; school_name: string | null;
  /** old free-text field, kept but no longer asked for: prayer_unit_id replaced it */
  prayer_group: string | null; prayer_unit_id: string; baptism_name: string | null;
  father_phone: string; email: string | null;
};
export type PrayerUnitRow = { id: string; name: string; active: boolean; created_at: string };
export type StudentRow = PersonalFields & {
  id: string; admission_no: string; photo_url: string | null; status: StudentStatus;
  inactive_reason: string | null; class_id: string | null; created_at: string;
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
  /** attended the exam but missed this subject: shown as AB, marks 0 */
  is_absent: boolean;
  remarks: string | null; entered_by: string | null; updated_at: string;
};
export type AttendanceRow = {
  id: string; student_id: string; class_id: string; date: string; status: AttendanceStatus;
  remark: string | null; marked_by: string | null; updated_at: string;
};
export type ExamAttendanceStatus = "present" | "absent";
export type ExamAttendanceRow = {
  id: string; exam_id: string; student_id: string; status: ExamAttendanceStatus;
  remark: string | null; marked_by: string | null; updated_at: string;
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
  headmaster_name: string | null; vicar_name: string | null;
  /** the Headmaster's signature */
  signature_url: string | null; vicar_signature_url: string | null;
  certificate_wording: Partial<Record<CertificateType, string>>;
  /** read it with readNavStyle() */
  nav_icons: unknown; updated_at: string;
};
export type NumberCounterRow = { kind: "admission" | "certificate"; year: number; last_value: number };
