-- Migration : déplace toutes les tables de l'appli Multisports du schéma
-- "public" vers un schéma dédié "multisports", pour cohabiter proprement
-- avec vos autres projets (budget, coffre) dans la même base Supabase.
--
-- À exécuter UNE SEULE FOIS, dans Supabase > SQL Editor.
--
-- Remarque : le fichier supabase/schema.sql de ce dépôt ne décrit que 6
-- tables (participants, sports, participant_sports, documents,
-- basketball_matches, swim_results), mais le code de l'appli interroge en
-- réalité 19 tables (basketball_clubs, basketball_players,
-- basketball_classements, basketball_phases, basketball_match_stats,
-- basketball_comite_imports, swimmers, swim_competitions,
-- swim_planned_competitions, swim_points_table, swim_relay_teams,
-- swim_relay_legs, other_sport_results, other_sport_result_files, etc.) —
-- schema.sql n'a manifestement pas été tenu à jour au fil des évolutions.
-- Ce script ne se fie donc pas à une liste écrite en dur : il déplace
-- AUTOMATIQUEMENT toutes les tables qui se trouvent dans "public" au moment
-- où vous l'exécutez, quelles qu'elles soient.
--
-- ⚠️ Si votre base héberge encore d'autres projets non migrés dans
-- "public" (autre que Multisports), ce script les déplacerait aussi par
-- erreur. Si c'est le cas, dites-le-moi et on listera les tables à la main
-- à la place. Si Budget et Coffre ont déjà leur propre schéma (comme fait
-- précédemment), ce qui reste dans "public" est normalement 100% Multisports.

create schema if not exists multisports;

do $$
declare
  t record;
  moved text[] := '{}';
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I set schema multisports;', t.tablename);
    moved := array_append(moved, t.tablename);
  end loop;

  if array_length(moved, 1) is null then
    raise notice 'Aucune table trouvée dans public : rien à déplacer (déjà fait ?).';
  else
    raise notice 'Tables déplacées vers multisports : %', array_to_string(moved, ', ');
  end if;
end $$;

-- Autorise les rôles de l'API à utiliser ce schéma (sans ça PostgREST
-- refuse, même une fois "multisports" ajouté aux "Exposed schemas" du
-- Dashboard).
grant usage on schema multisports to anon, authenticated;
grant all on all tables in schema multisports to authenticated;
grant select on all tables in schema multisports to anon;
alter default privileges in schema multisports grant all on tables to authenticated;

-- Vérification : doit renvoyer 0 ligne si tout a bien été déplacé
-- (en dehors des tables internes de Supabase, qui ne sont jamais dans public).
select tablename from pg_tables where schemaname = 'public';

-- Dernière étape, à faire à la main dans le Dashboard (pas en SQL), comme
-- vous l'avez indiqué : Project Settings > API > "Exposed schemas" >
-- ajoutez "multisports" à la liste (en minuscules — c'est le nom réel de
-- l'identifiant Postgres), puis Save.
