-- ============================================================================
-- Sport Famille — ajout du suivi des performances de natation + sync FFN
-- À exécuter dans Supabase SQL Editor. Ne supprime aucune donnée existante.
-- ============================================================================

alter table participant_sports add column if not exists ffn_swimmer_id text;
alter table participant_sports add column if not exists last_ffn_sync_at timestamptz;
alter table participant_sports add column if not exists last_ffn_sync_error text;

create table if not exists swim_results (
  id uuid primary key default gen_random_uuid(),
  participant_sport_id uuid not null references participant_sports(id) on delete cascade,
  event_name text not null,
  stroke text,
  distance_m int,
  pool_length int check (pool_length in (25, 50)),
  time_ms int,
  points int,
  age_at_swim int,
  location text,
  competition_date date,
  level text,
  result_url text,
  source text check (source in ('manuel', 'ffn')) not null default 'manuel',
  created_at timestamptz not null default now(),
  unique (participant_sport_id, event_name, pool_length)
);

create index if not exists idx_swim_results_participant_sport
  on swim_results (participant_sport_id);

alter table swim_results enable row level security;

drop policy if exists "authenticated_full_access" on swim_results;
create policy "authenticated_full_access" on swim_results
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
