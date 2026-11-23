-- Baptism name on registrations and students, in place of the Yes/No "baptised" question.
-- The baptised columns stay (no longer asked for), so nothing already saved is lost.

alter table registrations add column baptism_name varchar(120) null after prayer_group;

alter table students add column baptism_name varchar(120) null after prayer_group;
