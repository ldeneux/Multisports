-- Logos des clubs : diagnostic et rattrapage (Supabase > SQL Editor)

-- 1) Clubs présents dans tes matchs mais SANS logo connu :
select distinct regexp_replace(trim(t.n), '\s*-\s*\d+\s*$', '') as club
from (
  select team1_name as n, team1_logo_asset as l from multisports.basketball_matches
  union all
  select team2_name, team2_logo_asset from multisports.basketball_matches
) t
where t.l is null
  and not exists (
    select 1 from multisports.basketball_clubs c
    where c.club_key = regexp_replace(trim(t.n), '\s*-\s*\d+\s*$', '')
      and c.logo_asset is not null
  )
order by 1;

-- 2) APRÈS avoir importé les clubs du comité (onglet Basket > « Import clubs du comité »),
--    recopie les logos sur les matchs déjà enregistrés qui n'en avaient pas :
update multisports.basketball_matches m
set team1_logo_asset = c.logo_asset
from multisports.basketball_clubs c
where c.club_key = regexp_replace(trim(m.team1_name), '\s*-\s*\d+\s*$', '')
  and m.team1_logo_asset is null
  and c.logo_asset is not null;

update multisports.basketball_matches m
set team2_logo_asset = c.logo_asset
from multisports.basketball_clubs c
where c.club_key = regexp_replace(trim(m.team2_name), '\s*-\s*\d+\s*$', '')
  and m.team2_logo_asset is null
  and c.logo_asset is not null;

-- 3) Si l'import est toujours bloqué : logo d'un club ajouté à la main.
--    Sur competitions.ffbb.com, clic droit sur l'écusson > « Copier l'adresse de l'image » :
--    l'adresse contient un identifiant du type 3f8c1a52-....  (la partie après /assets/).
--    Remplace les deux valeurs entre apostrophes puis lance :
-- insert into multisports.basketball_clubs (club_key, display_name, logo_asset)
-- values ('SAONE VALLEE BASKET', 'SAONE VALLEE BASKET', 'IDENTIFIANT-DU-LOGO')
-- on conflict (club_key) do update set logo_asset = excluded.logo_asset;
