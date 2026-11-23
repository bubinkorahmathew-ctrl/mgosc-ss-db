-- Father's mobile number and an email on registrations and students; a teacher's 12th passed year.
-- All optional, so existing rows are unaffected.

alter table registrations add column father_phone varchar(16) null after father_name;

alter table registrations add column email varchar(254) null after guardian_phone;

alter table students add column father_phone varchar(16) null after father_name;

alter table students add column email varchar(254) null after guardian_phone;

alter table profiles add column twelfth_passed_year smallint null after phone;
