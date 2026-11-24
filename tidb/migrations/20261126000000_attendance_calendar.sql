-- Phase B: attendance remarks and edit times, exam attendance, and a subject missed in an exam.
--
-- Rules enforced in lib/db (TiDB has no triggers): teachers write attendance of their own
-- classes up to 14 days back; nobody marks a future date; marks cannot be entered for a student
-- marked absent for the exam; a missed subject (is_absent) carries 0 marks.

alter table attendance add column remark varchar(200) null after status;

alter table attendance add column updated_at datetime(3) not null default current_timestamp(3) after marked_by;

create table exam_attendance (
  id char(36) not null default (uuid()) primary key,
  exam_id char(36) not null,
  student_id char(36) not null,
  status enum('present','absent') not null,
  remark varchar(200),
  marked_by char(36),
  updated_at datetime(3) not null default current_timestamp(3),
  unique key exam_attendance_unique (exam_id, student_id),
  key exam_attendance_student_idx (student_id),
  key exam_attendance_marked_by_idx (marked_by),
  constraint exam_attendance_exam_fk foreign key (exam_id) references exams (id) on delete cascade,
  constraint exam_attendance_student_fk foreign key (student_id) references students (id) on delete cascade,
  constraint exam_attendance_marked_by_fk foreign key (marked_by) references profiles (id) on delete set null
) default charset = utf8mb4 collate = utf8mb4_bin;

alter table marks add column is_absent boolean not null default false after marks_obtained;
