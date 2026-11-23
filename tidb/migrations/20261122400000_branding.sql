-- The signature image (was Supabase Storage). Not in lib/db/schema.ts: only lib/branding.ts uses it.

create table branding_images (
  kind enum('signature') not null primary key,
  mime enum('image/png','image/jpeg') not null,
  data mediumblob not null,
  updated_at datetime(3) not null default current_timestamp(3)
);
