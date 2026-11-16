-- =============================================================================
-- 11 — Basket : synchro globale « Mettre à jour les calendriers & résultats »
-- À exécuter UNE FOIS dans Supabase > SQL Editor (schéma "multisports").
-- Idempotent, ne supprime ni ne modifie aucune donnée existante.
-- =============================================================================

-- Équipes FFBB suivies par la participante (liste séparée par des virgules).
-- Format : catégorie + sexe + n° d'équipe éventuel. Exemples : U15F   U13F-2   SENF   « U15F, SENF-2 »
-- Vide = l'appli devine (catégorie de la ligne si elle contient le sexe, sinon les phases déjà
-- présentes de la saison en cours).
alter table multisports.participant_sports add column if not exists ffbb_team_codes text;

-- Résumé de la dernière mise à jour (affiché sous le bouton).
alter table multisports.participant_sports add column if not exists last_ffbb_sync_summary text;

notify pgrst, 'reload schema';
