-- ============================================================================
-- Sport Famille — replays : rattacher un replay à un participant (filtre Tous / Candice / Amandine / Julia)
-- À exécuter une fois dans Supabase > SQL Editor. Sans danger si relancé ; ne supprime aucune donnée.
-- ============================================================================

alter table multisports.replay_groups
  add column if not exists participant_id uuid references multisports.participants(id) on delete set null;

create index if not exists idx_replay_groups_participant on multisports.replay_groups (participant_id);

-- Les replays déjà liés à un match de basket prennent le participant de ce match.
update multisports.replay_groups g
set participant_id = ps.participant_id
from multisports.basketball_matches m
join multisports.participant_sports ps on ps.id = m.participant_sport_id
where g.match_id = m.id
  and g.participant_id is null;

notify pgrst, 'reload schema';

-- Les replays de natation ou « autre » (sans match) restent sans participant : il suffit de les ouvrir,
-- de toucher « Modifier » et de choisir le participant dans la liste.
