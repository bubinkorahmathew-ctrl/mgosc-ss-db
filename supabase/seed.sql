-- =============================================================================
-- The StudentMasterDB - development seed data
-- 1 headmaster (placeholder), 2 teachers, 3 classes, 4 subjects, 10 students.
--
-- !! DEVELOPMENT ONLY !!  All seeded users share the password below.
--    Do NOT run this file on your production project (see README).
--    Still used as the test fixture of tests/db and tests/tidb (no logins are copied to TiDB).
--    Dev password:  ChangeMe!2026
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Auth users (email confirmed, role stored in app_metadata for routing)
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated',
   'authenticated', 'headmaster@example.com', crypt('ChangeMe!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"headmaster"}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222221', 'authenticated',
   'authenticated', 'teacher1@example.com', crypt('ChangeMe!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"teacher"}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated',
   'authenticated', 'teacher2@example.com', crypt('ChangeMe!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"teacher"}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222221',
               '22222222-2222-2222-2222-222222222222');

insert into public.profiles (id, full_name, phone, role) values
  ('11111111-1111-1111-1111-111111111111', 'Headmaster (change me)', '9000000000', 'headmaster'),
  ('22222222-2222-2222-2222-222222222221', 'Mary Thomas', '9000000001', 'teacher'),
  ('22222222-2222-2222-2222-222222222222', 'George Varghese', '9000000002', 'teacher');

-- ---------------------------------------------------------------------------
-- Academic year, classes, teachers
-- ---------------------------------------------------------------------------
insert into public.academic_years (id, name, start_date, end_date, is_current) values
  ('aaaaaaaa-0000-0000-0000-000000002026', '2026-27', '2026-06-01', '2027-03-31', true);

insert into public.classes (id, name, section, academic_year_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'Class 1', null, 'aaaaaaaa-0000-0000-0000-000000002026'),
  ('cccccccc-0000-0000-0000-000000000002', 'Class 2', null, 'aaaaaaaa-0000-0000-0000-000000002026'),
  ('cccccccc-0000-0000-0000-000000000003', 'Class 3', null, 'aaaaaaaa-0000-0000-0000-000000002026');

-- teacher1 -> Class 1; teacher2 -> Class 2 and Class 3 (exercises the class switcher)
insert into public.class_teachers (class_id, teacher_id) values
  ('cccccccc-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222221'),
  ('cccccccc-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222'),
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222');

-- ---------------------------------------------------------------------------
-- Subjects
-- ---------------------------------------------------------------------------
insert into public.subjects (id, name, max_marks, sort_order) values
  ('5b000000-0000-0000-0000-000000000001', 'Old Testament', 50, 1),
  ('5b000000-0000-0000-0000-000000000002', 'New Testament', 50, 2),
  ('5b000000-0000-0000-0000-000000000003', 'Catechism', 50, 3),
  ('5b000000-0000-0000-0000-000000000004', 'Memory Verse', 25, 4);

-- ---------------------------------------------------------------------------
-- Students (some with Malayalam names)
-- ---------------------------------------------------------------------------
insert into public.students (id, admission_no, full_name, full_name_ml, dob, gender, father_name,
  mother_name, guardian_phone, address, baptised, school_class, school_name, class_id) values
  ('5d000000-0000-0000-0000-000000000001', 'SS-2026-0001', 'Aaron Mathew', 'ആരോൺ മാത്യു', '2020-07-14', 'male',
   'Mathew John', 'Anu Mathew', '9447000001', 'Kottayam', true, 'Grade 1', 'St. Mary''s School', 'cccccccc-0000-0000-0000-000000000001'),
  ('5d000000-0000-0000-0000-000000000002', 'SS-2026-0002', 'Anna Joseph', 'അന്ന ജോസഫ്', '2020-11-02', 'female',
   'Joseph Kurian', 'Mini Joseph', '9447000002', 'Kottayam', true, 'Grade 1', 'Holy Cross School', 'cccccccc-0000-0000-0000-000000000001'),
  ('5d000000-0000-0000-0000-000000000003', 'SS-2026-0003', 'Ben Varghese', null, '2021-01-20', 'male',
   'Varghese P', 'Liji Varghese', '9447000003', 'Pala', false, 'UKG', null, 'cccccccc-0000-0000-0000-000000000001'),
  ('5d000000-0000-0000-0000-000000000004', 'SS-2026-0004', 'Sreekutty George', 'ശ്രീക്കുട്ടി ജോർജ്', '2019-03-09', 'female',
   'George K', 'Bindu George', '9447000004', 'Kottayam', true, 'Grade 2', 'St. Mary''s School', 'cccccccc-0000-0000-0000-000000000002'),
  ('5d000000-0000-0000-0000-000000000005', 'SS-2026-0005', 'Geevarghese Thomas', 'ഗീവർഗീസ് തോമസ്', '2019-08-25', 'male',
   'Thomas Abraham', 'Reena Thomas', '9447000005', 'Changanacherry', true, 'Grade 2', 'Govt. LP School', 'cccccccc-0000-0000-0000-000000000002'),
  ('5d000000-0000-0000-0000-000000000006', 'SS-2026-0006', 'Riya Philip', null, '2019-12-01', 'female',
   'Philip M', 'Susan Philip', '9447000006', 'Pala', true, 'Grade 3', 'Holy Cross School', 'cccccccc-0000-0000-0000-000000000002'),
  ('5d000000-0000-0000-0000-000000000007', 'SS-2026-0007', 'Joel Abraham', 'ജോയൽ എബ്രഹാം', '2018-05-17', 'male',
   'Abraham C', 'Jincy Abraham', '9447000007', 'Kottayam', true, 'Grade 3', 'St. Mary''s School', 'cccccccc-0000-0000-0000-000000000003'),
  ('5d000000-0000-0000-0000-000000000008', 'SS-2026-0008', 'Elsa Kurian', null, '2018-09-30', 'female',
   'Kurian T', 'Asha Kurian', '9447000008', 'Kottayam', true, 'Grade 4', 'Govt. UP School', 'cccccccc-0000-0000-0000-000000000003'),
  ('5d000000-0000-0000-0000-000000000009', 'SS-2026-0009', 'Nithin Jacob', 'നിതിൻ ജേക്കബ്', '2017-11-11', 'male',
   'Jacob V', 'Shiny Jacob', '9447000009', 'Pala', true, 'Grade 4', 'Holy Cross School', 'cccccccc-0000-0000-0000-000000000003'),
  ('5d000000-0000-0000-0000-000000000010', 'SS-2026-0010', 'Merin Sam', null, '2018-02-28', 'female',
   'Sam Daniel', 'Lincy Sam', '9447000010', 'Changanacherry', false, 'Grade 3', null, 'cccccccc-0000-0000-0000-000000000003');

-- ---------------------------------------------------------------------------
-- One exam per class so marks entry can be tried straight away
-- ---------------------------------------------------------------------------
insert into public.exams (id, name, class_id, academic_year_id, exam_date) values
  ('e0000000-0000-0000-0000-000000000001', 'First Term', 'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000002026', '2026-10-04'),
  ('e0000000-0000-0000-0000-000000000002', 'First Term', 'cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000002026', '2026-10-04'),
  ('e0000000-0000-0000-0000-000000000003', 'First Term', 'cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000002026', '2026-10-04');

-- keep the admission counter in step with the seeded numbers
insert into public.number_counters (kind, year, last_value) values ('admission', 2026, 10)
on conflict (kind, year) do update set last_value = excluded.last_value;

-- ---------------------------------------------------------------------------
-- Settings + one pending registration for the inbox
-- ---------------------------------------------------------------------------
update public.school_settings set
  school_name = 'MGOSC Sunday School',
  address = 'Kottayam, Kerala',
  headmaster_name = 'Headmaster (change me)'
where id = 1;

insert into public.registrations (full_name, full_name_ml, dob, gender, father_name, mother_name,
  guardian_phone, address, baptised, school_class, school_name) values
  ('Christy Paul', 'ക്രിസ്റ്റി പോൾ', '2020-04-04', 'female', 'Paul V', 'Jessy Paul', '9447000011',
   'Kottayam', true, 'Grade 1', 'St. Mary''s School');
