-- =============================================================================
-- 7 — Bibliothèque de replays (vidéos hébergées sur YouTube / Google Drive)
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor. Relançable sans risque.
-- L'appli ne stocke que le LIEN de la vidéo, pas la vidéo elle-même.
-- =============================================================================
create table if not exists multisports.replays (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  provider text not null check (provider in ('youtube', 'drive', 'autre')),
  video_ref text,                                   -- identifiant YouTube / Drive extrait du lien
  sport text not null default 'basket' check (sport in ('basket', 'natation', 'autre')),
  recorded_on date,
  match_id uuid references multisports.basketball_matches(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists replays_recorded_on_idx on multisports.replays (recorded_on desc);

alter table multisports.replays enable row level security;

drop policy if exists "authenticated_full_access" on multisports.replays;
create policy "authenticated_full_access" on multisports.replays
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant all on multisports.replays to authenticated;
