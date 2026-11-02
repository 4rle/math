-- Run once in Supabase SQL Editor. Authentication is provided by Supabase Auth.
create table if not exists public.study_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.study_states enable row level security;
drop policy if exists "Read own study state" on public.study_states;
create policy "Read own study state" on public.study_states
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.study_states from anon, authenticated;
grant select on public.study_states to authenticated;

-- All writes are authenticated, owned by auth.uid(), and compare-and-swap.
-- A stale device can never overwrite a newer snapshot silently.
create or replace function public.save_study_state(expected_version bigint, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved public.study_states;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if expected_version is null or expected_version < 0 or payload is null
    or jsonb_typeof(payload) <> 'object'
    or payload->>'version' is distinct from '1'
    or jsonb_typeof(payload->'problems') is distinct from 'array'
    or jsonb_typeof(payload->'attempts') is distinct from 'array'
    or jsonb_typeof(payload->'exams') is distinct from 'array'
    or jsonb_typeof(payload->'settings') is distinct from 'object'
    or octet_length(payload::text) > 10485760
  then raise exception 'INVALID_STATE' using errcode = '22023'; end if;
  if expected_version = 0 then
    insert into public.study_states (user_id, version, state)
      values (owner_id, 1, payload)
      on conflict (user_id) do nothing returning * into saved;
  else
    update public.study_states set state = payload, version = version + 1, updated_at = now()
      where user_id = owner_id and version = expected_version returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'SYNC_CONFLICT' using errcode = 'P0001'; end if;
  return jsonb_build_object('version', saved.version, 'state', saved.state, 'updated_at', saved.updated_at);
end;
$$;
revoke all on function public.save_study_state(bigint, jsonb) from public, anon;
grant execute on function public.save_study_state(bigint, jsonb) to authenticated;
