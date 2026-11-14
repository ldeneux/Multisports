-- ============================================================================
-- Sport Famille — médailles (or, argent, bronze) attribuées à une course de la nageuse suivie.
-- À exécuter une fois dans Supabase > SQL Editor. Sans danger si relancé ; ne modifie aucune donnée existante.
--   * swim_results.medal      : course individuelle (et 1er relayeur affiché dans MPP / Performances)
--   * swim_relay_teams.medal  : relais (médaille de l'équipe)
-- La synchro FFN n'écrit pas cette colonne : une médaille n'est pas effacée par une nouvelle synchro.
-- ============================================================================

alter table multisports.swim_results
  add column if not exists medal text check (medal in ('gold', 'silver', 'bronze'));

alter table multisports.swim_relay_teams
  add column if not exists medal text check (medal in ('gold', 'silver', 'bronze'));

notify pgrst, 'reload schema';
