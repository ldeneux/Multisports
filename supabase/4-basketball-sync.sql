-- ============================================================================
-- Sport Famille — ajout du suivi des matchs de basket + sync FFBB (v2.1)
-- À exécuter dans Supabase SQL Editor. Ne supprime aucune donnée existante.
-- ============================================================================

-- Sur chaque affectation participant<->sport, on peut renseigner l'ID FFBB
-- (engagement) de l'équipe, et on garde une trace de la dernière synchro.
alter table participant_sports add column if not exists ffbb_engagement_id text;
alter table participant_sports add column if not exists last_ffbb_sync_at timestamptz;
alter table participant_sports add column if not exists last_ffbb_sync_error text;

create table if not exists basketball_matches (
  id uuid primary key default gen_random_uuid(),
  participant_sport_id uuid not null references participant_sports(id) on delete cascade,
  ffbb_rencontre_id text,
  match_date timestamptz,
  opponent text,
  location text,
  home_away text check (home_away in ('domicile', 'exterieur')),
  team_score_us int,
  team_score_them int,
  status text check (status in ('a_venir', 'joue', 'annule')) not null default 'a_venir',
  source text check (source in ('manuel', 'ffbb')) not null default 'manuel',
  created_at timestamptz not null default now()
);

-- Empêche les doublons quand on resynchronise plusieurs fois le même match FFBB
create unique index if not exists uniq_basketball_matches_ffbb
  on basketball_matches (participant_sport_id, ffbb_rencontre_id)
  where ffbb_rencontre_id is not null;

create index if not exists idx_basketball_matches_participant_sport
  on basketball_matches (participant_sport_id);

alter table basketball_matches enable row level security;

drop policy if exists "authenticated_full_access" on basketball_matches;
create policy "authenticated_full_access" on basketball_matches
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
