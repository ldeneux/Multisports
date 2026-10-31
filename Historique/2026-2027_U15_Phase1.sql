-- =============================================================================
-- Import de la saison régulière U15 féminines (10 matchs, journées 1 à 5).
-- Phase : 32a25c84-65fe-4f70-8375-3eac37736611
-- À coller dans Supabase > SQL Editor puis « Run ».
--
-- Ce que fait ce fichier :
--   - un match déjà présent (même identifiant FFBB) est mis à jour : date, équipes, score ;
--   - un match absent est ajouté, comme un match synchronisé FFBB, statut « joué » ;
--   - jamais de suppression ; les feuilles de match / stats existantes sont conservées.
-- Heures : l'appli enregistre l'heure de Paris telle qu'elle s'affiche (16:30 = 16:30),
-- étiquetée UTC. C'est ce que fait déjà la synchro et ce que lisent l'affichage et le
-- flux agenda (.ics). On ne convertit donc PAS vers un vrai fuseau.
-- La dernière requête affiche les matchs de la phase pour vérification.
-- =============================================================================
with ph as (
  select id as phase_id, participant_sport_id, poule_id, competition_name,
         coalesce(our_team_name, 'OLYMPIC SATHONAY') as our_team_name
  from multisports.basketball_phases
  where id = '32a25c84-65fe-4f70-8375-3eac37736611'
),
src(rencontre_id, journee, jour_heure, team1, score1, score2, team2) as (
  values
    ('200000014737707', '1', '2026-09-19 15:30', 'SO PONT DE CHERUY CHARVIEU CHAVANOZ BASKET-BALL', 17, 124, 'OLYMPIC SATHONAY'),
    ('200000014737709', '1', '2026-09-20 08:45', 'VAULX EN VELIN BASKET CLUB', 23, 72, 'AVENIR BASKET DAUPHINE - 2'),
    ('200000014737720', '2', '2026-09-26 14:30', 'OLYMPIC SATHONAY', 59, 33, 'VAULX EN VELIN BASKET CLUB'),
    ('200000014737719', '2', '2026-09-26 15:00', 'ASUL LYON BASKET - 2', 91, 31, 'SO PONT DE CHERUY CHARVIEU CHAVANOZ BASKET-BALL'),
    ('200000014737732', '3', '2026-10-03 17:30', 'SO PONT DE CHERUY CHARVIEU CHAVANOZ BASKET-BALL', 17, 97, 'AVENIR BASKET DAUPHINE - 2'),
    ('200000014737733', '3', '2026-10-04 15:30', 'ASUL LYON BASKET - 2', 55, 63, 'OLYMPIC SATHONAY'),
    ('200000014737745', '4', '2026-10-10 18:30', 'AVENIR BASKET DAUPHINE - 2', 57, 88, 'ASUL LYON BASKET - 2'),
    ('200000014737743', '4', '2026-10-11 13:15', 'VAULX EN VELIN BASKET CLUB', 77, 32, 'SO PONT DE CHERUY CHARVIEU CHAVANOZ BASKET-BALL'),
    ('200000014737757', '5', '2026-10-17 13:00', 'ASUL LYON BASKET - 2', 86, 19, 'VAULX EN VELIN BASKET CLUB'),
    ('200000014737756', '5', '2026-10-17 16:30', 'OLYMPIC SATHONAY', 61, 59, 'AVENIR BASKET DAUPHINE - 2')
),
calc as (
  select
    ph.participant_sport_id, ph.phase_id, ph.poule_id, ph.competition_name,
    s.rencontre_id, s.journee,
    (s.jour_heure::timestamp at time zone 'UTC') as match_date,
    s.team1, s.score1, s.score2, s.team2,
    case
      when lower(regexp_replace(s.team1, '\s*-\s*\d+\s*$', '')) = lower(regexp_replace(ph.our_team_name, '\s*-\s*\d+\s*$', '')) then true
      when lower(regexp_replace(s.team2, '\s*-\s*\d+\s*$', '')) = lower(regexp_replace(ph.our_team_name, '\s*-\s*\d+\s*$', '')) then false
    end as us_is_team1,
    (select b.logo_asset from multisports.basketball_clubs b
       where b.club_key = regexp_replace(s.team1, '\s*-\s*\d+\s*$', '') limit 1) as logo1,
    (select b.logo_asset from multisports.basketball_clubs b
       where b.club_key = regexp_replace(s.team2, '\s*-\s*\d+\s*$', '') limit 1) as logo2,
    (select t.ffbb_engagement_id from multisports.basketball_club_teams t
       where t.poule_id = ph.poule_id and lower(t.team_name) = lower(s.team1) limit 1) as eng1,
    (select t.ffbb_engagement_id from multisports.basketball_club_teams t
       where t.poule_id = ph.poule_id and lower(t.team_name) = lower(s.team2) limit 1) as eng2
  from ph cross join src s
),
mises_a_jour as (
  update multisports.basketball_matches m set
    phase_id = c.phase_id,
    poule_id = c.poule_id,
    season = '2026-2027',
    division_label = c.competition_name,
    numero_journee = c.journee,
    match_date = c.match_date,
    team1_name = c.team1, team2_name = c.team2,
    team1_score = c.score1, team2_score = c.score2,
    team1_logo_asset = coalesce(c.logo1, m.team1_logo_asset),
    team2_logo_asset = coalesce(c.logo2, m.team2_logo_asset),
    team1_engagement_id = coalesce(c.eng1, m.team1_engagement_id),
    team2_engagement_id = coalesce(c.eng2, m.team2_engagement_id),
    us_is_team1 = c.us_is_team1,
    home_away = case c.us_is_team1 when true then 'domicile' when false then 'exterieur' end,
    opponent = case c.us_is_team1 when true then c.team2 when false then c.team1
                 else c.team1 || ' vs ' || c.team2 end,
    team_score_us = case c.us_is_team1 when true then c.score1 when false then c.score2 end,
    team_score_them = case c.us_is_team1 when true then c.score2 when false then c.score1 end,
    status = 'joue'
  from calc c
  where m.participant_sport_id = c.participant_sport_id
    and m.ffbb_rencontre_id = c.rencontre_id
  returning m.ffbb_rencontre_id
)
insert into multisports.basketball_matches
  (participant_sport_id, phase_id, ffbb_rencontre_id, poule_id, season, division_label,
   numero_journee, match_date, opponent, home_away, us_is_team1,
   team1_name, team1_score, team1_logo_asset, team1_engagement_id,
   team2_name, team2_score, team2_logo_asset, team2_engagement_id,
   team_score_us, team_score_them, status, source)
select
  c.participant_sport_id, c.phase_id, c.rencontre_id, c.poule_id, '2026-2027', c.competition_name,
  c.journee, c.match_date,
  case c.us_is_team1 when true then c.team2 when false then c.team1
       else c.team1 || ' vs ' || c.team2 end,
  case c.us_is_team1 when true then 'domicile' when false then 'exterieur' end,
  c.us_is_team1,
  c.team1, c.score1, c.logo1, c.eng1,
  c.team2, c.score2, c.logo2, c.eng2,
  case c.us_is_team1 when true then c.score1 when false then c.score2 end,
  case c.us_is_team1 when true then c.score2 when false then c.score1 end,
  'joue', 'ffbb'
from calc c
where c.rencontre_id not in (select ffbb_rencontre_id from mises_a_jour);

-- Vérification : les 10 matchs de la phase, heures de Paris
select numero_journee as journee,
       to_char(match_date at time zone 'UTC', 'DD/MM HH24:MI') as heure_affichee,
       team1_name, team1_score, team2_score, team2_name, us_is_team1, status
from multisports.basketball_matches
where phase_id = '32a25c84-65fe-4f70-8375-3eac37736611'
order by match_date;