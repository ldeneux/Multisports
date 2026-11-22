-- ============================================================================
-- Sport Famille — replays : format d'une vidéo (Extrait, Résumé ou Complet), affiché par une icône à côté du « + ».
-- À exécuter une fois dans Supabase > SQL Editor. Sans danger si relancé ; ne modifie aucune donnée existante.
-- Le champ peut rester vide : aucune icône n'est alors affichée.
-- ============================================================================

alter table multisports.replay_groups
  add column if not exists format text check (format in ('extrait', 'resume', 'complet'));

notify pgrst, 'reload schema';
