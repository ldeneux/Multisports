-- ============================================================================
-- Sport Famille — Direct & replays (vidéos de matchs et de courses)
-- À exécuter dans le SQL Editor de Supabase (après schema.sql).
-- ============================================================================

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references participants(id) on delete set null,
  sport_id uuid references sports(id) on delete set null,
  title text not null,
  event_date date,
  -- youtube : lien YouTube (direct ou replay) ; file : fichier envoyé dans le bucket "videos" ;
  -- link : autre lien (ouvert dans un nouvel onglet)
  source text check (source in ('youtube', 'file', 'link')) not null default 'youtube',
  url text,
  youtube_id text,
  storage_path text,
  is_live boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

-- « Passages » d'une vidéo : un extrait (début → fin) qu'on peut revoir en boucle
-- (ex. « 50 m nage libre », « Le panier à 3 points »).
create table if not exists video_moments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  label text not null,
  start_sec numeric not null check (start_sec >= 0),
  end_sec numeric check (end_sec is null or end_sec > start_sec),
  created_at timestamptz not null default now()
);

create index if not exists idx_videos_participant on videos(participant_id);
create index if not exists idx_videos_date on videos(event_date desc);
create index if not exists idx_video_moments_video on video_moments(video_id);

alter table videos enable row level security;
alter table video_moments enable row level security;

create policy "authenticated_full_access" on videos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on video_moments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Stockage des petites vidéos (extraits de course, paniers…) : 50 Mo maximum par fichier
-- (limite du plan gratuit de Supabase). Pour un match entier, utilise plutôt un lien YouTube.
insert into storage.buckets (id, name, public, file_size_limit)
values ('videos', 'videos', true, 52428800)
on conflict (id) do nothing;

create policy "authenticated_upload_videos"
on storage.objects for insert
with check (bucket_id = 'videos' and auth.role() = 'authenticated');

create policy "authenticated_manage_videos"
on storage.objects for update
using (bucket_id = 'videos' and auth.role() = 'authenticated');

create policy "authenticated_delete_videos"
on storage.objects for delete
using (bucket_id = 'videos' and auth.role() = 'authenticated');

create policy "public_read_videos"
on storage.objects for select
using (bucket_id = 'videos');
