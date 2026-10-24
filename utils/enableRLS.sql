-- Supabase exposes every table in the public schema through its Data API (PostgREST).
-- This app never uses that API: the backend connects directly as the table owner,
-- which bypasses RLS. Enabling RLS with no policies and revoking the API roles'
-- grants blocks all Data API access without affecting the backend.
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- Safe to run more than once (e.g. in the Supabase SQL editor).

alter table public.users enable row level security;
alter table public.group_names enable row level security;
alter table public.group_members enable row level security;
alter table public.results enable row level security;
alter table public.target_words enable row level security;
alter table public.word_list enable row level security;
alter table public.sessions enable row level security;

revoke all on table public.users, public.group_names, public.group_members,
                    public.results, public.target_words, public.word_list, public.sessions
  from anon, authenticated;
revoke all on sequence public.group_members_id_seq, public.word_list_id_seq
  from anon, authenticated;
