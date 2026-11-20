-- =============================================================================
-- Sunday School Management - initial schema, RLS, helper functions
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('headmaster', 'teacher');
create type public.gender as enum ('male', 'female');
create type public.student_status as enum ('active', 'inactive', 'passed_out');
create type public.registration_status as enum ('pending', 'approved', 'rejected');
create type public.attendance_status as enum ('present', 'absent', 'late');
create type public.activity_type as enum ('competition', 'memory_verse', 'event', 'note');
create type public.certificate_type as enum
  ('completion', 'merit', 'attendance', 'participation', 'memory_verse', 'custom');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  phone text,
  role public.user_role not null default 'teacher',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  check (end_date > start_date)
);
-- at most one current year
create unique index academic_years_one_current on public.academic_years (is_current) where is_current;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  section text,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index classes_unique_name on public.classes (academic_year_id, name, coalesce(section, ''));
create index classes_academic_year_idx on public.classes (academic_year_id);

create table public.class_teachers (
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  primary key (class_id, teacher_id)
);
create index class_teachers_teacher_idx on public.class_teachers (teacher_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  admission_no text not null unique,
  full_name text not null check (char_length(full_name) between 1 and 120),
  full_name_ml text check (full_name_ml is null or char_length(full_name_ml) <= 120),
  dob date not null,
  gender public.gender not null,
  father_name text,
  mother_name text,
  guardian_phone text not null,
  address text,
  baptised boolean not null default false,
  school_class text not null,
  school_name text,
  photo_url text,
  status public.student_status not null default 'active',
  class_id uuid references public.classes (id) on delete set null,
  created_at timestamptz not null default now()
);
create index students_class_idx on public.students (class_id);
create index students_dob_idx on public.students (dob);
create index students_school_class_idx on public.students (school_class);
create index students_status_idx on public.students (status);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  full_name_ml text check (full_name_ml is null or char_length(full_name_ml) <= 120),
  dob date not null,
  gender public.gender not null,
  father_name text,
  mother_name text,
  guardian_phone text not null,
  address text,
  baptised boolean not null default false,
  school_class text not null,
  school_name text,
  status public.registration_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  student_id uuid references public.students (id) on delete set null
);
create index registrations_status_idx on public.registrations (status, submitted_at desc);
create index registrations_reviewed_by_idx on public.registrations (reviewed_by);
create index registrations_student_idx on public.registrations (student_id);

-- Rate-limit log for the public registration form (IP stored as salted hash).
create table public.registration_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index registration_attempts_ip_idx on public.registration_attempts (ip_hash, created_at desc);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  max_marks numeric(6,2) not null default 100 check (max_marks > 0),
  sort_order int not null default 0
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  class_id uuid not null references public.classes (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  exam_date date,
  created_at timestamptz not null default now()
);
create index exams_class_idx on public.exams (class_id);
create index exams_academic_year_idx on public.exams (academic_year_id);

create table public.marks (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  marks_obtained numeric(6,2) not null,
  remarks text,
  entered_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (exam_id, student_id, subject_id)
);
create index marks_student_idx on public.marks (student_id);
create index marks_subject_idx on public.marks (subject_id);
create index marks_entered_by_idx on public.marks (entered_by);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  date date not null,
  status public.attendance_status not null,
  marked_by uuid references public.profiles (id) on delete set null,
  unique (student_id, date)
);
create index attendance_class_date_idx on public.attendance (class_id, date);
create index attendance_marked_by_idx on public.attendance (marked_by);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid references public.students (id) on delete cascade,
  type public.activity_type not null,
  title text not null check (char_length(title) between 1 and 200),
  activity_date date not null,
  score numeric(8,2),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index activities_class_idx on public.activities (class_id, activity_date desc);
create index activities_student_idx on public.activities (student_id);
create index activities_created_by_idx on public.activities (created_by);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_no text not null unique,
  student_id uuid not null references public.students (id) on delete cascade,
  type public.certificate_type not null,
  title text not null,
  body_text text not null,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  exam_id uuid references public.exams (id) on delete set null,
  activity_id uuid references public.activities (id) on delete set null,
  -- snapshots so that re-downloads are identical even if records change later
  student_name text not null,
  student_name_ml text,
  class_name text not null,
  class_id uuid references public.classes (id) on delete set null,
  year_name text not null,
  class_teacher_name text,
  issued_on date not null default current_date,
  issued_by uuid references public.profiles (id) on delete set null,
  revoked boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index certificates_student_idx on public.certificates (student_id);
create index certificates_year_idx on public.certificates (academic_year_id);
create index certificates_exam_idx on public.certificates (exam_id);
create index certificates_activity_idx on public.certificates (activity_id);
create index certificates_class_idx on public.certificates (class_id);
create index certificates_issued_by_idx on public.certificates (issued_by);

create table public.school_settings (
  id int primary key default 1 check (id = 1),
  school_name text not null default 'Sunday School',
  address text,
  logo_url text,
  headmaster_name text,
  signature_url text,
  certificate_wording jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Per-year counters for admission and certificate numbers.
create table public.number_counters (
  kind text not null check (kind in ('admission', 'certificate')),
  year int not null,
  last_value int not null default 0,
  primary key (kind, year)
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_headmaster()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'headmaster' and active
  );
$$;

create or replace function public.is_teacher_of(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.class_teachers ct
    join public.profiles p on p.id = ct.teacher_id
    where ct.class_id = p_class_id
      and ct.teacher_id = auth.uid()
      and p.active
  );
$$;

create or replace function public.my_class_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select ct.class_id
  from public.class_teachers ct
  join public.profiles p on p.id = ct.teacher_id
  where ct.teacher_id = auth.uid() and p.active;
$$;

-- student belongs to a class the caller teaches
create or replace function public.teaches_student(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and public.is_teacher_of(s.class_id)
  );
$$;

create or replace function public.exam_class_id(p_exam_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$ select class_id from public.exams where id = p_exam_id; $$;

create or replace function public.student_class_id(p_student_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$ select class_id from public.students where id = p_student_id; $$;

-- Atomic sequential number generator: SS-2026-0001 / CERT-2026-0001
create or replace function public.next_number(p_kind text, p_year int)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  v int;
  prefix text;
begin
  if not (public.is_headmaster()
          or (p_kind = 'certificate' and exists (select 1 from public.my_class_ids()))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.number_counters (kind, year, last_value)
  values (p_kind, p_year, 1)
  on conflict (kind, year)
  do update set last_value = public.number_counters.last_value + 1
  returning last_value into v;
  prefix := case p_kind when 'admission' then 'SS' else 'CERT' end;
  return prefix || '-' || p_year || '-' || lpad(v::text, 4, '0');
end;
$$;

-- Year used in numbers = start year of the current academic year (fallback: calendar year)
create or replace function public.current_number_year()
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select extract(year from start_date)::int from public.academic_years where is_current limit 1),
    extract(year from (now() at time zone 'Asia/Kolkata'))::int
  );
$$;

-- Public certificate verification: exposes only the minimum fields.
create or replace function public.verify_certificate(p_no text)
returns table (valid boolean, type public.certificate_type, issued_on date, student_name text)
language sql stable security definer set search_path = public
as $$
  select not c.revoked, c.type, c.issued_on, c.student_name
  from public.certificates c
  where c.certificate_no = p_no
  limit 1;
$$;

-- Approve a registration atomically: create student + mark registration approved.
create or replace function public.approve_registration(p_registration_id uuid, p_class_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  r public.registrations;
  new_id uuid;
  adm text;
begin
  if not public.is_headmaster() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into r from public.registrations where id = p_registration_id for update;
  if not found then raise exception 'registration not found'; end if;
  if r.status <> 'pending' then raise exception 'registration already reviewed'; end if;
  if not exists (select 1 from public.classes where id = p_class_id) then
    raise exception 'class not found';
  end if;

  adm := public.next_number('admission', public.current_number_year());
  insert into public.students (admission_no, full_name, full_name_ml, dob, gender, father_name,
    mother_name, guardian_phone, address, baptised, school_class, school_name, class_id)
  values (adm, r.full_name, r.full_name_ml, r.dob, r.gender, r.father_name, r.mother_name,
    r.guardian_phone, r.address, r.baptised, r.school_class, r.school_name, p_class_id)
  returning id into new_id;

  update public.registrations
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), student_id = new_id
   where id = p_registration_id;
  return new_id;
end;
$$;

-- Make one academic year current (atomically clears the others).
create or replace function public.set_current_academic_year(p_year_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if not public.is_headmaster() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.academic_years set is_current = false where is_current and id <> p_year_id;
  update public.academic_years set is_current = true where id = p_year_id;
  if not found then raise exception 'academic year not found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- marks_obtained must be between 0 and subject max_marks
create or replace function public.trg_validate_marks()
returns trigger language plpgsql security definer set search_path = public as $$
declare mx numeric;
begin
  select max_marks into mx from public.subjects where id = new.subject_id;
  if new.marks_obtained < 0 or new.marks_obtained > mx then
    raise exception 'marks_obtained must be between 0 and %', mx using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end; $$;
create trigger marks_validate before insert or update on public.marks
for each row execute function public.trg_validate_marks();

-- only headmaster may change students.class_id (defence in depth; teachers have no UPDATE anyway)
create or replace function public.trg_guard_student_class()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is distinct from old.class_id
     and auth.uid() is not null and not public.is_headmaster() then
    raise exception 'only the headmaster can change a student''s class' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger students_guard_class before update on public.students
for each row execute function public.trg_guard_student_class();

-- profiles: non-headmaster can only change own full_name / phone
create or replace function public.trg_guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_headmaster() then
    if new.role is distinct from old.role or new.active is distinct from old.active
       or new.id is distinct from old.id then
      raise exception 'you can only change your name and phone' using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;
create trigger profiles_guard before update on public.profiles
for each row execute function public.trg_guard_profile();

-- attendance.class_id must equal the student's class at time of insert
create or replace function public.trg_attendance_class()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is distinct from (select class_id from public.students where id = new.student_id) then
    raise exception 'student is not in this class' using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger attendance_class_check before insert or update of student_id, class_id on public.attendance
for each row execute function public.trg_attendance_class();

-- activities.student_id (if set) must be in activities.class_id
create or replace function public.trg_activity_student()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.student_id is not null and new.class_id is distinct from
     (select class_id from public.students where id = new.student_id) then
    raise exception 'student is not in this class' using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger activities_student_check before insert or update of student_id, class_id on public.activities
for each row execute function public.trg_activity_student();

-- marks: student must belong to the exam's class
create or replace function public.trg_marks_student_class()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.student_class_id(new.student_id) is distinct from public.exam_class_id(new.exam_id) then
    raise exception 'student is not in this exam''s class' using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger marks_student_class before insert or update of student_id, exam_id on public.marks
for each row execute function public.trg_marks_student_class();

-- certificates: revoke fields only by headmaster; protect revoked_at
create or replace function public.trg_certificate_revoke()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.revoked and not old.revoked then new.revoked_at := now(); end if;
  if not new.revoked then new.revoked_at := null; end if;
  return new;
end; $$;
create trigger certificates_revoke before update on public.certificates
for each row execute function public.trg_certificate_revoke();

-- registrations inserted anonymously: force pending + clear review fields
create or replace function public.trg_registration_insert()
returns trigger language plpgsql as $$
begin
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  new.student_id := null;
  new.submitted_at := now();
  return new;
end; $$;
create trigger registrations_force_pending before insert on public.registrations
for each row execute function public.trg_registration_insert();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.academic_years enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.students enable row level security;
alter table public.registrations enable row level security;
alter table public.registration_attempts enable row level security;
alter table public.subjects enable row level security;
alter table public.exams enable row level security;
alter table public.marks enable row level security;
alter table public.attendance enable row level security;
alter table public.activities enable row level security;
alter table public.certificates enable row level security;
alter table public.school_settings enable row level security;
alter table public.number_counters enable row level security;

-- headmaster: full access everywhere
do $$
declare t text;
begin
  foreach t in array array['profiles','academic_years','classes','class_teachers','students',
    'registrations','subjects','exams','marks','attendance','activities','certificates',
    'school_settings']
  loop
    execute format(
      'create policy headmaster_all on public.%I for all to authenticated
         using (public.is_headmaster()) with check (public.is_headmaster())', t);
  end loop;
end $$;

-- profiles: own row read; own name/phone update (trigger guards other columns)
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- teachers may see names of co-teachers of their classes (for certificate signature lines)
create policy profiles_coteachers_select on public.profiles for select to authenticated
  using (exists (select 1 from public.class_teachers ct
                 where ct.teacher_id = profiles.id and ct.class_id in (select public.my_class_ids())));

-- reference data readable by any signed-in user
create policy academic_years_read on public.academic_years for select to authenticated using (true);
create policy subjects_read on public.subjects for select to authenticated using (true);
create policy school_settings_read on public.school_settings for select to authenticated using (true);

-- classes / class_teachers: teacher sees own classes
create policy classes_teacher_select on public.classes for select to authenticated
  using (public.is_teacher_of(id));
create policy class_teachers_teacher_select on public.class_teachers for select to authenticated
  using (public.is_teacher_of(class_id));

-- students: teacher SELECT only (no insert/update/delete)
create policy students_teacher_select on public.students for select to authenticated
  using (public.is_teacher_of(class_id));

-- registrations: anyone may insert a pending row; only headmaster reads/updates
create policy registrations_public_insert on public.registrations for insert to anon, authenticated
  with check (status = 'pending' and reviewed_by is null and student_id is null);

-- exams: teacher reads own class exams
create policy exams_teacher_select on public.exams for select to authenticated
  using (public.is_teacher_of(class_id));

-- marks: teacher select/insert/update in own classes
create policy marks_teacher_select on public.marks for select to authenticated
  using (public.is_teacher_of(public.exam_class_id(exam_id)));
create policy marks_teacher_insert on public.marks for insert to authenticated
  with check (public.is_teacher_of(public.exam_class_id(exam_id))
              and public.teaches_student(student_id));
create policy marks_teacher_update on public.marks for update to authenticated
  using (public.is_teacher_of(public.exam_class_id(exam_id)))
  with check (public.is_teacher_of(public.exam_class_id(exam_id))
              and public.teaches_student(student_id));

-- attendance
create policy attendance_teacher_select on public.attendance for select to authenticated
  using (public.is_teacher_of(class_id));
create policy attendance_teacher_insert on public.attendance for insert to authenticated
  with check (public.is_teacher_of(class_id) and public.teaches_student(student_id));
create policy attendance_teacher_update on public.attendance for update to authenticated
  using (public.is_teacher_of(class_id))
  with check (public.is_teacher_of(class_id) and public.teaches_student(student_id));

-- activities
create policy activities_teacher_select on public.activities for select to authenticated
  using (public.is_teacher_of(class_id));
create policy activities_teacher_insert on public.activities for insert to authenticated
  with check (public.is_teacher_of(class_id)
              and (student_id is null or public.teaches_student(student_id)));
create policy activities_teacher_update on public.activities for update to authenticated
  using (public.is_teacher_of(class_id))
  with check (public.is_teacher_of(class_id)
              and (student_id is null or public.teaches_student(student_id)));

-- certificates: teacher select + insert for own-class students, never update/delete
create policy certificates_teacher_select on public.certificates for select to authenticated
  using (public.teaches_student(student_id) or public.is_teacher_of(class_id));
create policy certificates_teacher_insert on public.certificates for insert to authenticated
  with check (public.teaches_student(student_id)
              and public.is_teacher_of(class_id)
              and revoked = false
              and issued_by = auth.uid());

-- registration_attempts / number_counters: no policies -> only service role / definer functions

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.registration_attempts from anon, authenticated;
revoke all on public.number_counters from anon, authenticated;
revoke execute on function public.next_number(text, int) from public, anon;
revoke execute on function public.approve_registration(uuid, uuid) from public, anon;
revoke execute on function public.set_current_academic_year(uuid) from public, anon;
grant execute on function public.verify_certificate(text) to anon, authenticated;
grant execute on function public.next_number(text, int) to authenticated;
grant execute on function public.approve_registration(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for logo + signature (public read, headmaster write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy branding_public_read on storage.objects for select
  using (bucket_id = 'branding');
create policy branding_headmaster_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_headmaster());
create policy branding_headmaster_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_headmaster());
create policy branding_headmaster_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_headmaster());

-- settings row with default certificate wording (placeholders: {student_name} {class} {year} {exam} {rank})
insert into public.school_settings (id, school_name, certificate_wording) values (1, 'MGOSC Sunday School', jsonb_build_object(
  'completion',    'This is to certify that {student_name} has successfully completed {class} of the Sunday School during the academic year {year}.',
  'merit',         'This certificate is awarded to {student_name} of {class} for securing Rank {rank} in {exam} during the academic year {year}.',
  'attendance',    'This certificate is awarded to {student_name} of {class} in recognition of excellent attendance during the academic year {year}.',
  'participation', 'This certificate is awarded to {student_name} of {class} for participation in {exam} during the academic year {year}.',
  'memory_verse',  'This certificate is awarded to {student_name} of {class} for outstanding achievement in Memory Verse recitation during the academic year {year}.',
  'custom',        ''
)) on conflict do nothing;
