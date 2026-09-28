-- =============================================================================
-- 6 — Import des statistiques TeamStats + table d'équipe (joueuse × saison × phase)
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor (schéma "multisports").
-- Tout est idempotent (if not exists / on conflict) : relancer ne casse rien.
--
-- Chaîne de liens (rien n'est dupliqué, tout se rejoint par ces clés) :
--   participants ─┐
--                 ├─ participant_sports (participant + sport, club, catégorie)
--   sports ───────┘        │ participant_sport_id
--                          ▼
--                 basketball_phases      ffbb_engagement_id (ID FFBB équipe) → poule_id (ID FFBB poule)
--                          │ phase_id
--                          ▼
--                 basketball_matches     poule_id → ffbb_rencontre_id (ID FFBB match)
--                                        team1_engagement_id / team2_engagement_id
--                          ▲
--   stats_matches.ffbb_match_id  = basketball_matches.ffbb_rencontre_id   (lien TeamStats)
--
--   basketball_team (NOUVEAU) : joueuse ↔ phase (donc ↔ saison, ID FFBB équipe, ID FFBB poule)
-- =============================================================================

-- 1) Table d'équipe : une ligne = une joueuse (ou un entraîneur) dans une phase.
--    phase_id est la vraie clé (une phase amicale n'a pas d'ID FFBB engagement) ;
--    season / ffbb_engagement_id / ffbb_poule_id sont recopiés pour la lisibilité.
create table if not exists multisports.basketball_team (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references multisports.basketball_players(id) on delete cascade,
  phase_id uuid not null references multisports.basketball_phases(id) on delete cascade,
  season text not null,
  ffbb_engagement_id text,
  ffbb_poule_id text,
  created_at timestamptz not null default now(),
  unique (player_id, phase_id)
);
create index if not exists idx_basketball_team_phase on multisports.basketball_team (phase_id);
create index if not exists idx_basketball_team_engagement on multisports.basketball_team (ffbb_engagement_id);
create index if not exists idx_basketball_team_season on multisports.basketball_team (season);

alter table multisports.basketball_team enable row level security;
drop policy if exists "authenticated_full_access" on multisports.basketball_team;
create policy "authenticated_full_access" on multisports.basketball_team
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 2) Statistiques complètes par joueuse et par match (colonnes de l'écran TeamStats).
alter table multisports.basketball_match_stats
  add column if not exists jersey_number_match int,          -- n° porté CE jour-là
  add column if not exists two_att int not null default 0,   -- 2 pts tentés
  add column if not exists three_att int not null default 0, -- 3 pts tentés
  add column if not exists reb_off int not null default 0,
  add column if not exists reb_def int not null default 0,
  add column if not exists assists int not null default 0,
  add column if not exists fouls_drawn int not null default 0;

-- 3) Détail par quart-temps (importé de TeamStats, lecture seule dans Multisports).
create table if not exists multisports.basketball_match_period_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references multisports.basketball_matches(id) on delete cascade,
  player_id uuid not null references multisports.basketball_players(id) on delete cascade,
  period int not null,
  is_starter boolean not null default false,
  playing_time_seconds int not null default 0,
  points int not null default 0,
  pts2_made int not null default 0,
  pts2_att int not null default 0,
  pts3_made int not null default 0,
  pts3_att int not null default 0,
  ft_made int not null default 0,
  ft_att int not null default 0,
  reb_off int not null default 0,
  reb_def int not null default 0,
  assists int not null default 0,
  fouls int not null default 0,
  fouls_drawn int not null default 0,
  created_at timestamptz not null default now(),
  unique (match_id, player_id, period)
);
create index if not exists idx_bb_period_stats_match on multisports.basketball_match_period_stats (match_id);

alter table multisports.basketball_match_period_stats enable row level security;
drop policy if exists "authenticated_full_access" on multisports.basketball_match_period_stats;
create policy "authenticated_full_access" on multisports.basketball_match_period_stats
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on multisports.basketball_team, multisports.basketball_match_period_stats to authenticated;
grant select on multisports.basketball_team, multisports.basketball_match_period_stats to anon;

-- 4) Reprise de l'existant dans basketball_team (sans rien supprimer) :
--    a) phases passées : joueuses ayant des stats sur un match de la phase ;
--    b) phases de la saison la plus récente : tout l'effectif actuel du participant.
insert into multisports.basketball_team (player_id, phase_id, season, ffbb_engagement_id, ffbb_poule_id)
select distinct s.player_id, m.phase_id, ph.season, ph.ffbb_engagement_id, ph.poule_id
from multisports.basketball_match_stats s
join multisports.basketball_matches m on m.id = s.match_id
join multisports.basketball_phases ph on ph.id = m.phase_id
where m.phase_id is not null
on conflict (player_id, phase_id) do nothing;

insert into multisports.basketball_team (player_id, phase_id, season, ffbb_engagement_id, ffbb_poule_id)
select p.id, ph.id, ph.season, ph.ffbb_engagement_id, ph.poule_id
from multisports.basketball_players p
join multisports.basketball_phases ph on ph.participant_sport_id = p.participant_sport_id
where ph.season = (select max(season) from multisports.basketball_phases)
on conflict (player_id, phase_id) do nothing;

-- 5) Le rattachement direct à un participant ne concerne plus que la joueuse SUIVIE.
--    ⚠️ À lancer seulement APRÈS avoir déployé la nouvelle version de l'appli et
--    vérifié qu'un effectif s'affiche bien (l'appli lit désormais basketball_team).
-- alter table multisports.basketball_players alter column participant_sport_id drop not null;
-- update multisports.basketball_players set participant_sport_id = null where is_self is not true;

notify pgrst, 'reload schema';
