-- Why a student was made inactive (for example "Exit KSA"). Optional, so existing rows are unaffected.

alter table students add column inactive_reason varchar(200) null after status;
