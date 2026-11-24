-- Phase A: prayer units, and prayer unit, father's name and father's mobile become required
-- on students and registrations. Age is never stored: v_student_age derives it.
--
-- Existing rows are filled in first, then the columns become NOT NULL:
--   prayer unit     the unit named like the old free-text prayer_group, else "Not assigned"
--   father's mobile the parent / guardian phone
--   father's name   "Not given"
-- The Students page's "Incomplete records" filter finds rows with "Not assigned" or "Not given".
-- The old prayer_group column stays (unused), so nothing typed before is lost.

create table prayer_units (
  id char(36) not null default (uuid()) primary key,
  name varchar(120) not null,
  active boolean not null default true,
  created_at datetime(3) not null default current_timestamp(3),
  unique key prayer_units_name_key (name)
) default charset = utf8mb4 collate = utf8mb4_bin;

-- fixed id: the app refers to it (lib/config.ts NOT_ASSIGNED_PRAYER_UNIT). Inactive, so it is
-- never offered for new entries.
insert into prayer_units (id, name, active) values ('00000000-0000-4000-8000-000000000001', 'Not assigned', false);

insert into prayer_units (name)
select distinct g from (
  select trim(prayer_group) as g from students
  union
  select trim(prayer_group) as g from registrations
) x
where g is not null and g <> '' and g <> 'Not assigned';

alter table students add column prayer_unit_id char(36) null after prayer_group;

alter table registrations add column prayer_unit_id char(36) null after prayer_group;

update students s left join prayer_units u on u.name = trim(s.prayer_group)
set s.prayer_unit_id = coalesce(u.id, '00000000-0000-4000-8000-000000000001');

update registrations r left join prayer_units u on u.name = trim(r.prayer_group)
set r.prayer_unit_id = coalesce(u.id, '00000000-0000-4000-8000-000000000001');

update students set father_phone = guardian_phone where father_phone is null or father_phone = '';

update registrations set father_phone = guardian_phone where father_phone is null or father_phone = '';

update students set father_name = 'Not given' where father_name is null or trim(father_name) = '';

update registrations set father_name = 'Not given' where father_name is null or trim(father_name) = '';

alter table students modify column prayer_unit_id char(36) not null;

alter table registrations modify column prayer_unit_id char(36) not null;

alter table students modify column father_phone varchar(16) not null;

alter table registrations modify column father_phone varchar(16) not null;

alter table students modify column father_name text not null;

alter table registrations modify column father_name text not null;

alter table students add constraint students_prayer_unit_fk foreign key (prayer_unit_id) references prayer_units (id) on delete restrict;

alter table registrations add constraint registrations_prayer_unit_fk foreign key (prayer_unit_id) references prayer_units (id) on delete restrict;

-- Age in whole years and remaining months, as on today in India (Asia/Kolkata, no daylight saving).
-- The app computes the same thing in lib/dates.ts (ageOn / ageParts).
create view v_student_age as
select id, dob,
  timestampdiff(year, dob, date(convert_tz(utc_timestamp(), '+00:00', '+05:30'))) as age_years,
  timestampdiff(month, dob, date(convert_tz(utc_timestamp(), '+00:00', '+05:30'))) % 12 as age_months
from students;
