-- ============================================================================
-- Sport Famille — cache des poules FFBB (alimenté depuis ton PC)
-- À exécuter UNE FOIS dans Supabase → SQL Editor. Ne supprime aucune donnée.
--
-- Pourquoi : le site competitions.ffbb.com bloque les serveurs Vercel (HTTP 403)
-- mais pas ton PC. Le script scripts/push-ffbb.mjs, lancé depuis ton PC, lit les
-- pages des poules et dépose le résultat ici ; le bouton « Synchroniser FFBB »
-- de l'appli s'en sert quand la lecture directe est bloquée.
-- ============================================================================

create table if not exists multisports.ffbb_poule_cache (
  poule_id text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table multisports.ffbb_poule_cache enable row level security;

drop policy if exists "authenticated_full_access" on multisports.ffbb_poule_cache;
create policy "authenticated_full_access" on multisports.ffbb_poule_cache
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select, insert, update, delete on multisports.ffbb_poule_cache to authenticated;
