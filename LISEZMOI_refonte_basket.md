# Refonte de l'onglet Basket — « Mettre à jour les calendriers & résultats » (v2)

v2 : corrige l'erreur « Unsupported Server Component type: Module » de la v1 (page.js était tronqué).

Copie chaque fichier de ce zip à la même place dans le projet (écrase l'ancien), puis :

1. Supabase > SQL Editor : exécuter `supabase/11-basket-sync-globale.sql` (2 colonnes ajoutées, rien n'est modifié).
2. Paramètres > ligne Basket de chaque participante : renseigner « Équipes FFBB suivies »
   (ex. `U15F`, `U13F-2`, `SENF`, ou plusieurs séparées par des virgules).
   Si le champ reste vide, l'appli devine (catégorie contenant le sexe, ou phases déjà présentes de la saison).
3. Lancer MiseAJourFFBB_Club.exe (inchangé) puis, dans Basket, choisir la participante et cliquer
   « Mettre à jour les calendriers & résultats ».

## Ce qui change
- Un seul bouton : toutes les poules du cache FFBB sont lues ; pour la participante, seules les poules
  de la saison en cours où joue une de ses équipes sont gardées. Phases, matchs, classements créés / mis à jour seuls.
- Disparus de l'écran : « Gérer les phases », « Synchroniser » par phase, ID d'engagement, lien de poule.
- Les phases déjà saisies cette saison sont reconnues (même poule / même engagement) et réutilisées :
  feuilles de match, stats et effectifs sont conservés.
- « Ajouter un match manuellement » devient « Ajouter un match amical » (phase « Matchs amicaux » créée seule).

## Jamais d'écrasement d'une saison précédente
- poule dont les matchs ne sont pas de la saison en cours : ignorée ;
- seules les phases de la saison en cours sont lues / créées / modifiées ;
- un match déjà rattaché à une autre saison n'est jamais réécrit ;
- nettoyage limité aux matchs FFBB de la phase en cours ;
- un score saisi à la main n'est pas effacé si la FFBB n'en publie pas encore.

Anciennes actions (`syncPhase`, `addPhase`, `updatePhase`, `deletePhase`) : toujours dans actions.js mais plus appelées ; supprimables.
