-- Game tables for the poker Edge Function. Only the function (service role) reads or writes them.
create table if not exists public.rooms (
  code text primary key,
  rev integer not null default 0,
  data jsonb not null,
  players text[] not null,
  updated_at timestamptz not null default now()
);
create index if not exists rooms_players on public.rooms using gin (players);
alter table public.rooms enable row level security;
revoke all on public.rooms from anon, authenticated;
