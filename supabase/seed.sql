-- ============================================================================
-- Sport Famille — données de départ (v2)
-- À exécuter APRÈS schema.sql, dans le SQL Editor de Supabase.
-- ============================================================================

-- Les 5 sports principaux (bandeau du haut) + un exemple de sport secondaire
insert into sports (name, slug, is_main) values
  ('Basket', 'basket', true),
  ('Natation', 'natation', true),
  ('Course à pied', 'course-a-pied', true),
  ('Triathlon', 'triathlon', true),
  ('Plongée', 'plongee', true),
  ('Deltaplane', 'deltaplane', false)
on conflict (slug) do nothing;

-- Les 3 filles
insert into participants (first_name, sex, birthdate) values
  ('Candice', 'F', '2012-08-23'),
  ('Amandine', 'F', '2015-09-13'),
  ('Julia', 'F', '2017-09-28')
on conflict do nothing;

-- Candice — Basket à Sathonay Camp, U15
insert into participant_sports (participant_id, sport_id, club, category, link_url)
select p.id, s.id, 'Sathonay Camp', 'U15',
  'https://competitions.ffbb.com/ligues/ara/comites/0069/clubs/ara0069106/equipes/200000005251991'
from participants p, sports s
where p.first_name = 'Candice' and s.slug = 'basket'
on conflict do nothing;

-- Julia — Basket, U11 (club à préciser dans Paramètres)
insert into participant_sports (participant_id, sport_id, category)
select p.id, s.id, 'U11'
from participants p, sports s
where p.first_name = 'Julia' and s.slug = 'basket'
on conflict do nothing;

-- Amandine — Natation à Rillieux Natation
insert into participant_sports (participant_id, sport_id, club, link_url)
select p.id, s.id, 'Rillieux Natation',
  'https://ffn.extranat.fr/webffn/nat_recherche.php?idact=nat'
from participants p, sports s
where p.first_name = 'Amandine' and s.slug = 'natation'
on conflict do nothing;
