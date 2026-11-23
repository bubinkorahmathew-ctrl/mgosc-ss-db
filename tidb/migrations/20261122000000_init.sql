-- =============================================================================
-- The StudentMasterDB - TiDB Cloud (MySQL) schema, ported from supabase/migrations
--
-- Run inside the `studentmasterdb` database (never `sys`, a system schema).
--
-- This file holds tables, keys and indexes ONLY. It does not reproduce these parts of
-- the Postgres schema, so it is not safe to point the app at it until they are ported:
--   * row level security (who may read or write which class's rows)
--   * triggers (marks range, class membership, certificate numbering/snapshot/freeze,
--     registrations forced to pending, profile guards)
--   * functions (next_number, approve_registration, set_current_academic_year, ...)
--   * CHECK constraints: TiDB ignores them while tidb_enable_check_constraint is OFF.
--     Still missing: end_date > start_date, max_marks > 0, school_settings.id = 1,
--     non-empty full_name / title. Maximum lengths are enforced by VARCHAR sizes.
--
-- Conventions: ids are lower-case CHAR(36); DATETIME values are UTC; text compares
-- case-sensitively as in Postgres (use LOWER() where the app used ilike).
-- =============================================================================

create table profiles (
  id char(36) not null primary key,
  full_name varchar(120) not null,
  phone text,
  role enum('headmaster','teacher') not null default 'teacher',
  active boolean not null default true,
  created_at datetime(3) not null default current_timestamp(3)
) default charset = utf8mb4 collate = utf8mb4_bin;

create table academic_years (
  id char(36) not null default (uuid()) primary key,
  name varchar(255) not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  -- NULL unless current, so the unique index allows at most one current year
  current_key tinyint as (if(is_current, 1, null)) virtual,
  unique key academic_years_name_key (name),
  unique key academic_years_one_current (current_key)
) default charset = utf8mb4 collate = utf8mb4_bin;

create table classes (
  id char(36) not null default (uuid()) primary key,
  name varchar(255) not null,
  section varchar(255),
  section_key varchar(255) as (coalesce(section, '')) virtual,
  academic_year_id char(36) not null,
  created_at datetime(3) not null default current_timestamp(3),
  unique key classes_unique_name (academic_year_id, name, section_key),
  constraint classes_year_fk foreign key (academic_year_id) references academic_years (id) on delete restrict
) default charset = utf8mb4 collate = utf8mb4_bin;

create table class_teachers (
  class_id char(36) not null,
  teacher_id char(36) not null,
  primary key (class_id, teacher_id),
  key class_teachers_teacher_idx (teacher_id),
  constraint class_teachers_class_fk foreign key (class_id) references classes (id) on delete cascade,
  constraint class_teachers_teacher_fk foreign key (teacher_id) references profiles (id) on delete cascade
) default charset = utf8mb4 collate = utf8mb4_bin;

create table students (
  id char(36) not null default (uuid()) primary key,
  admission_no varchar(32) not null,
  full_name varchar(120) not null,
  full_name_ml varchar(120),
  dob date not null,
  gender enum('male','female') not null,
  father_name text,
  mother_name text,
  guardian_phone text not null,
  address text,
  baptised boolean not null default false,
  school_class varchar(255) not null,
  school_name text,
  photo_url text,
  status enum('active','inactive','passed_out') not null default 'active',
  class_id char(36),
  created_at datetime(3) not null default current_timestamp(3),
  unique key students_admission_no_key (admission_no),
  key students_class_idx (class_id),
  key students_dob_idx (dob),
  key students_school_class_idx (school_class),
  key students_status_idx (status),
  constraint students_class_fk foreign key (class_id) references classes (id) on delete set null
) default charset = utf8mb4 collate = utf8mb4_bin;

create table registrations (
  id char(36) not null default (uuid()) primary key,
  full_name varchar(120) not null,
  full_name_ml varchar(120),
  dob date not null,
  gender enum('male','female') not null,
  father_name text,
  mother_name text,
  guardian_phone text not null,
  address text,
  baptised boolean not null default false,
  school_class varchar(255) not null,
  school_name text,
  status enum('pending','approved','rejected') not null default 'pending',
  submitted_at datetime(3) not null default current_timestamp(3),
  reviewed_by char(36),
  reviewed_at datetime(3),
  review_note text,
  student_id char(36),
  key registrations_status_idx (status, submitted_at),
  key registrations_reviewed_by_idx (reviewed_by),
  key registrations_student_idx (student_id),
  constraint registrations_reviewer_fk foreign key (reviewed_by) references profiles (id) on delete set null,
  constraint registrations_student_fk foreign key (student_id) references students (id) on delete set null
) default charset = utf8mb4 collate = utf8mb4_bin;

create table registration_attempts (
  id bigint not null auto_increment primary key,
  ip_hash varchar(128) not null,
  created_at datetime(3) not null default current_timestamp(3),
  key registration_attempts_ip_idx (ip_hash, created_at)
) default charset = utf8mb4 collate = utf8mb4_bin;

create table subjects (
  id char(36) not null default (uuid()) primary key,
  name varchar(255) not null,
  max_marks decimal(6,2) not null default 100,
  sort_order int not null default 0,
  unique key subjects_name_key (name)
) default charset = utf8mb4 collate = utf8mb4_bin;

create table exams (
  id char(36) not null default (uuid()) primary key,
  name varchar(255) not null,
  class_id char(36) not null,
  academic_year_id char(36) not null,
  exam_date date,
  created_at datetime(3) not null default current_timestamp(3),
  key exams_class_idx (class_id),
  key exams_academic_year_idx (academic_year_id),
  constraint exams_class_fk foreign key (class_id) references classes (id) on delete cascade,
  constraint exams_year_fk foreign key (academic_year_id) references academic_years (id) on delete restrict
) default charset = utf8mb4 collate = utf8mb4_bin;

-- exam results are computed from this table (lib/results.ts)
create table marks (
  id char(36) not null default (uuid()) primary key,
  exam_id char(36) not null,
  student_id char(36) not null,
  subject_id char(36) not null,
  marks_obtained decimal(6,2) not null,
  remarks text,
  entered_by char(36),
  updated_at datetime(3) not null default current_timestamp(3) on update current_timestamp(3),
  unique key marks_exam_student_subject_key (exam_id, student_id, subject_id),
  key marks_student_idx (student_id),
  key marks_subject_idx (subject_id),
  key marks_entered_by_idx (entered_by),
  constraint marks_exam_fk foreign key (exam_id) references exams (id) on delete cascade,
  constraint marks_student_fk foreign key (student_id) references students (id) on delete cascade,
  constraint marks_subject_fk foreign key (subject_id) references subjects (id) on delete restrict,
  constraint marks_entered_by_fk foreign key (entered_by) references profiles (id) on delete set null
) default charset = utf8mb4 collate = utf8mb4_bin;

create table attendance (
  id char(36) not null default (uuid()) primary key,
  student_id char(36) not null,
  class_id char(36) not null,
  `date` date not null,
  status enum('present','absent','late') not null,
  marked_by char(36),
  unique key attendance_student_date_key (student_id, `date`),
  key attendance_class_date_idx (class_id, `date`),
  key attendance_marked_by_idx (marked_by),
  constraint attendance_student_fk foreign key (student_id) references students (id) on delete cascade,
  constraint attendance_class_fk foreign key (class_id) references classes (id) on delete cascade,
  constraint attendance_marked_by_fk foreign key (marked_by) references profiles (id) on delete set null
) default charset = utf8mb4 collate = utf8mb4_bin;

create table activities (
  id char(36) not null default (uuid()) primary key,
  class_id char(36) not null,
  student_id char(36),
  type enum('competition','memory_verse','event','note') not null,
  title varchar(200) not null,
  activity_date date not null,
  score decimal(8,2),
  notes text,
  created_by char(36),
  created_at datetime(3) not null default current_timestamp(3),
  key activities_class_idx (class_id, activity_date),
  key activities_student_idx (student_id),
  key activities_created_by_idx (created_by),
  constraint activities_class_fk foreign key (class_id) references classes (id) on delete cascade,
  constraint activities_student_fk foreign key (student_id) references students (id) on delete cascade,
  constraint activities_created_by_fk foreign key (created_by) references profiles (id) on delete set null
) default charset = utf8mb4 collate = utf8mb4_bin;

create table certificates (
  id char(36) not null default (uuid()) primary key,
  certificate_no varchar(32) not null,
  student_id char(36) not null,
  type enum('completion','merit','attendance','participation','memory_verse','custom') not null,
  title text not null,
  body_text text not null,
  academic_year_id char(36) not null,
  exam_id char(36),
  activity_id char(36),
  student_name varchar(120) not null,
  student_name_ml varchar(120),
  class_name text not null,
  class_id char(36),
  year_name text not null,
  class_teacher_name text,
  -- no default: the writer must supply the Asia/Kolkata date
  issued_on date not null,
  issued_by char(36),
  revoked boolean not null default false,
  revoked_at datetime(3),
  created_at datetime(3) not null default current_timestamp(3),
  unique key certificates_no_key (certificate_no),
  key certificates_student_idx (student_id),
  key certificates_year_idx (academic_year_id),
  key certificates_exam_idx (exam_id),
  key certificates_activity_idx (activity_id),
  key certificates_class_idx (class_id),
  key certificates_issued_by_idx (issued_by),
  constraint certificates_student_fk foreign key (student_id) references students (id) on delete cascade,
  constraint certificates_year_fk foreign key (academic_year_id) references academic_years (id) on delete restrict,
  constraint certificates_exam_fk foreign key (exam_id) references exams (id) on delete set null,
  constraint certificates_activity_fk foreign key (activity_id) references activities (id) on delete set null,
  constraint certificates_class_fk foreign key (class_id) references classes (id) on delete set null,
  constraint certificates_issued_by_fk foreign key (issued_by) references profiles (id) on delete set null
) default charset = utf8mb4 collate = utf8mb4_bin;

create table school_settings (
  id int not null default 1 primary key,
  school_name varchar(255) not null default 'Sunday School',
  address text,
  logo_url text,
  headmaster_name text,
  signature_url text,
  certificate_wording json not null,
  updated_at datetime(3) not null default current_timestamp(3) on update current_timestamp(3)
) default charset = utf8mb4 collate = utf8mb4_bin;

create table number_counters (
  kind enum('admission','certificate') not null,
  `year` int not null,
  `last_value` int not null default 0, -- reserved word in TiDB: always quote
  primary key (kind, `year`)
) default charset = utf8mb4 collate = utf8mb4_bin;

insert into school_settings (id, school_name, certificate_wording) values (1, 'MGOSC Sunday School', json_object(
  'completion',    'This is to certify that {student_name} has successfully completed {class} of the Sunday School during the academic year {year}.',
  'merit',         'This certificate is awarded to {student_name} of {class} for securing Rank {rank} in {exam} during the academic year {year}.',
  'attendance',    'This certificate is awarded to {student_name} of {class} in recognition of excellent attendance during the academic year {year}.',
  'participation', 'This certificate is awarded to {student_name} of {class} for participation in {exam} during the academic year {year}.',
  'memory_verse',  'This certificate is awarded to {student_name} of {class} for outstanding achievement in Memory Verse recitation during the academic year {year}.',
  'custom',        ''
));
