-- Three roles: super admin, admin, teacher.
--   super admin = role 'headmaster' + is_super
--   admin       = role 'headmaster'
--   teacher     = role 'teacher'
-- is_super is deliberately NOT in lib/db/schema.ts, so no request through the data client can
-- read it, filter on it or set it. Only lib/authn and scripts/headmaster.ts write it.

alter table profiles add column is_super boolean not null default false;
