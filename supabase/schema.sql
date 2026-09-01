-- ============================================================================
-- Sport Famille — schéma de base de données (v2, reset complet)
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > coller > Run
-- ⚠️ Ce script supprime les anciennes tables (basket/natation v1) si elles
-- existent, pour repartir sur une base propre.
-- ============================================================================

create extension if not exists "pgcrypto";

drop table if exists basketball_quarter_stats cascade;
drop table if exists basketball_matches cascade;
drop table if exists swim_results cascade;
drop table if exists swim_swimmers cascade;
drop table if exists swim_meets cascade;
drop table if exists diplomas cascade;
drop table if exists children cascade;

-- ----------------------------------------------------------------------------
-- 1. Participants — les personnes suivies (les filles, et plus tard d'autres)
-- ----------------------------------------------------------------------------
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  sex text check (sex in ('F', 'M', 'Autre')),
  birthdate date,
  photo_url text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Sports — catalogue des sports disponibles
--    is_main = apparaît en onglet dédié dans le bandeau (Basket, Natation,
--    Course à pied, Triathlon, Plongée). Les autres tombent dans
--    "Autres sports".
-- ----------------------------------------------------------------------------
create table if not exists sports (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_main boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Affectations — quel participant pratique quel sport, avec club/catégorie/lien
-- ----------------------------------------------------------------------------
create table if not exists participant_sports (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  sport_id uuid not null references sports(id) on delete cascade,
  club text,
  category text,
  link_url text,
  ffbb_engagement_id text,
  last_ffbb_sync_at timestamptz,
  last_ffbb_sync_error text,
  ffn_swimmer_id text,
  last_ffn_sync_at timestamptz,
  last_ffn_sync_error text,
  created_at timestamptz not null default now(),
  unique (participant_id, sport_id)
);

-- ----------------------------------------------------------------------------
-- 3ter. Natation — performances (saisies à la main ou synchronisées FFN)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3bis. Basket — matchs (saisis à la main ou synchronisés depuis la FFBB)
-- ----------------------------------------------------------------------------
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

create unique index if not exists uniq_basketball_matches_ffbb
  on basketball_matches (participant_sport_id, ffbb_rencontre_id)
  where ffbb_rencontre_id is not null;

create index if not exists idx_basketball_matches_participant_sport
  on basketball_matches (participant_sport_id);

-- ----------------------------------------------------------------------------
-- 4. Documents — diplômes, licences, certificats... multisport
-- ----------------------------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  sport_id uuid references sports(id) on delete set null,
  kind text check (kind in ('diplome', 'licence', 'certificat', 'autre')) not null default 'diplome',
  title text not null,
  organization text,
  obtained_date date,
  valid_until date,
  document_url text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_participant_sports_participant on participant_sports(participant_id);
create index if not exists idx_participant_sports_sport on participant_sports(sport_id);
create index if not exists idx_documents_participant on documents(participant_id);

-- ----------------------------------------------------------------------------
-- 5. Sécurité (RLS) — application familiale privée à un seul compte :
--    tout utilisateur authentifié peut tout faire, personne d'autre ne voit rien.
-- ----------------------------------------------------------------------------
alter table participants enable row level security;
alter table sports enable row level security;
alter table participant_sports enable row level security;
alter table documents enable row level security;
alter table basketball_matches enable row level security;
alter table swim_results enable row level security;

create policy "authenticated_full_access" on participants
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on sports
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on participant_sports
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on basketball_matches
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on swim_results
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
