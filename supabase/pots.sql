-- Run once in the Supabase SQL editor (project zafdbndpldvpojozwekd).
-- The publishable key cannot create tables.

create table if not exists public.pots (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  share_id text not null unique,
  is_public boolean not null default false,
  recipe jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pots_owner_idx on public.pots (owner, updated_at desc);

alter table public.pots enable row level security;

drop policy if exists pots_select on public.pots;
drop policy if exists pots_insert on public.pots;
drop policy if exists pots_update on public.pots;
drop policy if exists pots_delete on public.pots;

create policy pots_select on public.pots
  for select to anon, authenticated
  using (is_public or auth.uid() = owner);

create policy pots_insert on public.pots
  for insert to authenticated
  with check (auth.uid() = owner);

create policy pots_update on public.pots
  for update to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

create policy pots_delete on public.pots
  for delete to authenticated
  using (auth.uid() = owner);

grant select on public.pots to anon, authenticated;
grant insert, update, delete on public.pots to authenticated;
