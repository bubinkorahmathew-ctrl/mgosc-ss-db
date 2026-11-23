-- =============================================================================
-- Login. Replaces Supabase Auth.
-- These tables are deliberately NOT in lib/db/schema.ts, so the app's data client cannot
-- reach them. Only lib/authn uses them.
-- =============================================================================

create table users (
  id char(36) not null primary key,
  email varchar(254) not null,
  password_hash varchar(255) not null,
  password_changed_at datetime(3) not null default current_timestamp(3),
  created_at datetime(3) not null default current_timestamp(3),
  unique key users_email_key (email),
  constraint users_profile_fk foreign key (id) references profiles (id) on delete cascade
) default charset = utf8mb4 collate = utf8mb4_bin;

create table sessions (
  -- SHA-256 of the cookie value, so a leaked table cannot be used to sign in
  token_hash char(64) not null primary key,
  user_id char(36) not null,
  created_at datetime(3) not null default current_timestamp(3),
  expires_at datetime(3) not null,
  key sessions_user_idx (user_id),
  key sessions_expires_idx (expires_at),
  constraint sessions_user_fk foreign key (user_id) references users (id) on delete cascade
) default charset = utf8mb4 collate = utf8mb4_bin;

-- Salted hashes only: no email addresses or IPs.
create table sign_in_attempts (
  id char(36) not null primary key,
  account_key char(64) not null,
  ip_key char(64) not null,
  created_at datetime(3) not null,
  key sign_in_attempts_account_idx (account_key, created_at),
  key sign_in_attempts_ip_idx (ip_key, created_at),
  key sign_in_attempts_created_idx (created_at)
) default charset = utf8mb4 collate = utf8mb4_bin;
