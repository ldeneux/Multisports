-- ============================================================================
-- Sport Famille — liste des clubs du Rhône (filtre « Clubs du Rhône » du menu MPA)
-- Source : annuaire du comité départemental, https://rhone.auvergnerhonealpes-natation.fr/clubs/
-- À exécuter une fois dans Supabase > SQL Editor. Ne supprime aucune donnée.
--
-- La base ne contient pas le département des clubs (seulement leur nom et leur identifiant FFN) :
-- cette table sert de référence. Le filtre compare le nom du club de la nageuse à ces lignes :
-- tous les mots d'un nom de la liste (au moins deux) doivent se retrouver dans le nom du club, sans tenir
-- compte des accents, des majuscules ni des petits mots. Ex. « SAUVETEURS DE GIVORS NATATION » = « Sauveteurs Givors ».
--
-- Un club du Rhône n'est pas reconnu ? Ajoutez une ligne (un autre nom = un alias) et/ou son identifiant FFN
-- (swimmers.ffn_club_id) : l'identifiant FFN est le plus fiable.
-- Un club hors Rhône est reconnu à tort ? Supprimez ou précisez la ligne concernée.
-- ============================================================================

create table if not exists multisports.swim_clubs_rhone (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  ffn_club_id text,
  created_at timestamptz not null default now()
);

alter table multisports.swim_clubs_rhone enable row level security;
drop policy if exists "authenticated_full_access" on multisports.swim_clubs_rhone;
create policy "authenticated_full_access" on multisports.swim_clubs_rhone
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select, insert, update, delete on multisports.swim_clubs_rhone to authenticated;

insert into multisports.swim_clubs_rhone (name) values
  ('Cercle Aquatique Lyon Métropole'), ('Les Crocos de l''Archipel'), ('Club Vaudais Natation'), ('Sauveteurs Givors'),
  ('Team A.B Lyon'), ('Triton Club Belleville'), ('Ujs La Mulatière Natation'), ('Usol Vaugneray'),
  ('Vienne Condrieu Olympique'), ('Villeurbanne Natation'), ('SAL St-Priest Natation'), ('Rillieux Natation'),
  ('RC Bron Décines Natation'), ('Patronage Laïque d''Oullins'), ('Nat Villefranche En Beaujolais'),
  ('Lyon Rhône Water Polo'), ('A.S. Grezieu La Varenne'), ('Aqua Synchro Lyon'), ('Aquatic Club Fidesien'),
  ('AS Caluire'), ('CA Des Pierres Dorées'), ('Cascol Natation'), ('Chassieu Natation'), ('CMO Vénissieux'),
  ('Cn Du Pays Mornantais'), ('CN Tarare'), ('Lyon Natation Métropole'), ('Lyon Plongeon Club'), ('A.S Mure Natation')
on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- CONTRÔLE (à lancer à la main) : les clubs présents en base, avec le nombre de nageuses.
-- Comparez avec la liste ci-dessus pour repérer un club du Rhône écrit autrement (puis ajoutez un alias).
--   select club, ffn_club_id, count(*) as nageuses
--   from multisports.swimmers
--   where club is not null
--   group by club, ffn_club_id
--   order by club;
--
-- Pour lier un club à son identifiant FFN (plus fiable que le nom) :
--   update multisports.swim_clubs_rhone set ffn_club_id = '<identifiant>' where name = 'Rillieux Natation';
-- ----------------------------------------------------------------------------
