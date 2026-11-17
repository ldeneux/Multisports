# Refonte de l'onglet Basket — « Mettre à jour les calendriers & résultats » (v4)

Copie chaque fichier de ce zip à la même place dans le projet (écrase l'ancien), puis :

1. Supabase > SQL Editor : exécuter `supabase/11-basket-sync-globale.sql`
   (ajoute la colonne « équipes FFBB suivies » et renomme le club « Sathonay Camp » en « OLYMPIC SATHONAY » ; rien d'autre n'est modifié).
2. Paramètres > ligne Basket de chaque participante : renseigner « Équipes FFBB suivies cette saison »
   (ex. `U15F`, `U13F-2`, `SENF`, ou plusieurs séparées par des virgules). À refaire à chaque début de saison.
3. Lancer MiseAJourFFBB_Club.exe (inchangé) puis, dans Basket, cliquer « Mettre à jour les calendriers & résultats ».

## v4
- Clic sur Julia / Candice : on arrive sur la DERNIÈRE phase, filtre « OLYMPIC SATHONAY », TOUTES les journées.
- Le champ « Catégorie » n'apparaît plus sur les lignes Basket de Paramètres (et n'est plus utilisé par le basket).
- « Sathonay Camp » remplacé par « OLYMPIC SATHONAY » (bouton de filtre, club par défaut des joueuses, base de données).
- Classement : celui de la FFBB n'est gardé que s'il contient TOUTES les équipes de la poule ; sinon il est recalculé
  à partir des matchs (qui, eux, sont complets). Le détail est affiché sous « Dernière mise à jour ».

## Rappel des changements précédents
- Un seul bouton, à droite des badges : met à jour les équipes de TOUTES les participantes en une lecture du cache.
- Phases affichées au-dessus des onglets ; plus de gestion de phases, de « Réinitialiser » ni de matchs amicaux.
- Jamais d'écrasement d'une saison précédente (poules d'une autre saison ignorées, matchs archivés intacts,
  nettoyage limité à la phase en cours, score déjà enregistré conservé si la FFBB n'en publie pas).
