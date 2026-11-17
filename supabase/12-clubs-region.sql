-- =============================================================================
-- 12 — Basket : clubs et équipes de toute la région Auvergne-Rhône-Alpes
-- À exécuter UNE FOIS dans Supabase > SQL Editor. Idempotent, ne supprime rien.
--
-- Principe (le même que pour les calendriers) : le programme MiseAJourFFBB_ClubsARA.exe,
-- lancé depuis ton PC (le site competitions.ffbb.com bloque les serveurs Vercel), dépose ses
-- lectures dans ffbb_clubs_cache ; le bouton « Importer les clubs & équipes » de l'appli les
-- range ensuite dans basketball_clubs (clubs) et basketball_club_teams (équipes).
-- =============================================================================

-- 1) Dépôt du programme : une ligne par club (données déjà extraites, pas les pages brutes).
create table if not exists multisports.ffbb_clubs_cache (
  club_code   text primary key,                 -- ex. ARA0069106
  comite_code text,                             -- ex. 0069
  data        jsonb not null,                   -- { nom, url, logo_asset, equipes: [{ engagement_id, nom }] }
  fetched_at  timestamptz not null default now()
);
alter table multisports.ffbb_clubs_cache enable row level security;
drop policy if exists "authenticated_full_access" on multisports.ffbb_clubs_cache;
create policy "authenticated_full_access" on multisports.ffbb_clubs_cache
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on multisports.ffbb_clubs_cache to authenticated;

-- 2) Les clubs gardent leur code FFBB.
alter table multisports.basketball_clubs add column if not exists ffbb_code text;
alter table multisports.basketball_clubs add column if not exists comite_code text;

-- 3) Les équipes des clubs (une ligne par équipe engagée ; l'identifiant change à chaque saison / phase,
--    donc les équipes des saisons précédentes restent en base, jamais écrasées).
create table if not exists multisports.basketball_club_teams (
  engagement_id text primary key,
  club_key      text not null,
  club_code     text,
  team_name     text,
  season        text not null,
  updated_at    timestamptz not null default now()
);
create index if not exists basketball_club_teams_club_idx on multisports.basketball_club_teams (club_key, season);
alter table multisports.basketball_club_teams enable row level security;
drop policy if exists "authenticated_full_access" on multisports.basketball_club_teams;
create policy "authenticated_full_access" on multisports.basketball_club_teams
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on multisports.basketball_club_teams to authenticated;

notify pgrst, 'reload schema';
