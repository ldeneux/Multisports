-- =============================================================================
-- 11 — Basket : synchro globale « Mettre à jour les calendriers & résultats »
-- À exécuter UNE FOIS dans Supabase > SQL Editor (schéma "multisports").
-- Idempotent, ne supprime ni ne modifie aucune donnée existante.
-- =============================================================================

-- Équipes FFBB suivies par la participante (liste séparée par des virgules).
-- Format : catégorie + sexe + n° d'équipe éventuel. Exemples : U15F   U13F-2   SENF   « U15F, SENF-2 »
-- À mettre à jour à chaque début de saison (c'est la seule chose à régler). Vide = l'appli reprend
-- les équipes déjà présentes dans les phases de la saison en cours, sinon elle signale « équipe inconnue ».
alter table multisports.participant_sports add column if not exists ffbb_team_codes text;

notify pgrst, 'reload schema';
