-- One-off migration for a database created before passwords were hashed.
-- Run it once in the Supabase SQL editor, right before deploying the backend that uses session tokens.
-- Safe to run again: values that are already bcrypt hashes are left alone.
begin;

-- pgcrypto is pre-installed on Supabase (in the "extensions" schema); this is a no-op there
create extension if not exists pgcrypto;
set local search_path = public, extensions;

-- varchar(30) is too short for a 60-character bcrypt hash
alter table users alter column password type text;
alter table group_names alter column password type text;

-- gen_salt('bf', 10) makes the same kind of bcrypt hash as the backend (bcryptjs, 10 rounds)
update users set password = crypt(password, gen_salt('bf', 10)) where password !~ '^\$2[aby]\$';
update group_names set password = crypt(password, gen_salt('bf', 10)) where password !~ '^\$2[aby]\$';

-- token_hash is the SHA-256 of a login token; the token itself is never stored
create table if not exists sessions (token_hash text primary key, username varchar(30) not null, expires_at timestamptz not null,
                                     foreign key (username) references users(username) on delete cascade);
alter table sessions enable row level security;
revoke all on table sessions from anon, authenticated;

commit;
