-- Prayer group name on registrations and students.
-- The Malayalam name is no longer asked for; its columns stay, so nothing is lost and
-- certificate snapshots keep their shape.

alter table registrations add column prayer_group varchar(120) null after school_name;

alter table students add column prayer_group varchar(120) null after school_name;
