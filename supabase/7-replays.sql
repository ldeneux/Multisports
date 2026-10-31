-- =============================================================================
-- 7 — Replays avec chapitres (vidéos hébergées sur YouTube / Google Drive)
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor. Relançable sans risque.
-- L'appli ne stocke que les LIENS des vidéos, jamais les vidéos.
--
--   replay_groups   : un match ou une compétition (titre + infos générales)
--   replay_chapters : ses vidéos (1er quart-temps, 50 m NL, …), dans l'ordre
--
-- (Si tu avais lancé une version précédente de ce fichier, l'ancienne table
--  « replays » n'est plus utilisée ; tu peux la supprimer avec la ligne ci-dessous.)
-- drop table if exists multisports.replays;
-- =============================================================================
create table if not exists multisports.replay_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sport text not null default 'basket' check (sport in ('basket', 'natation', 'autre')),
  recorded_on date,
  season text,                       -- ex. 2025-2026
  team text,                         -- équipe / catégorie, ex. U15
  division text,                     -- division / niveau
  match_id uuid references multisports.basketball_matches(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists multisports.replay_chapters (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references multisports.replay_groups(id) on delete cascade,
  label text not null,               -- ex. 1er quart-temps, 50 m NL
  subtitle text,                     -- petit texte sous le nom du chapitre (facultatif)
  url text not null,
  provider text not null check (provider in ('youtube', 'drive', 'autre')),
  video_ref text,                    -- identifiant YouTube / Drive extrait du lien
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Pour une base où les tables existent déjà (version précédente) :
alter table multisports.replay_chapters add column if not exists subtitle text;

create index if not exists replay_groups_recorded_on_idx on multisports.replay_groups (recorded_on desc);
create index if not exists replay_chapters_group_idx on multisports.replay_chapters (group_id, position);

alter table multisports.replay_groups enable row level security;
alter table multisports.replay_chapters enable row level security;

drop policy if exists "authenticated_full_access" on multisports.replay_groups;
create policy "authenticated_full_access" on multisports.replay_groups
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated_full_access" on multisports.replay_chapters;
create policy "authenticated_full_access" on multisports.replay_chapters
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on multisports.replay_groups to authenticated;
grant all on multisports.replay_chapters to authenticated;
