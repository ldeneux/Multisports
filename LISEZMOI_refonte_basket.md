# Refonte de l'onglet Basket — « Mettre à jour les calendriers & résultats » (v3)

Copie chaque fichier de ce zip à la même place dans le projet (écrase l'ancien), puis :

1. Supabase > SQL Editor : exécuter `supabase/11-basket-sync-globale.sql` (1 colonne ajoutée, rien n'est modifié).
2. Paramètres > ligne Basket de chaque participante : renseigner « Équipes FFBB suivies cette saison »
   (ex. `U15F`, `U13F-2`, `SENF`, ou plusieurs séparées par des virgules). À refaire à chaque début de saison.
   Le champ « Catégorie » n'est plus utilisé. Si « Équipes FFBB suivies » est vide, l'appli reprend les équipes
   déjà présentes dans les phases de la saison en cours ; sinon elle signale « équipe inconnue ».
3. Lancer MiseAJourFFBB_Club.exe (inchangé) puis, dans Basket, cliquer « Mettre à jour les calendriers & résultats ».

## Ce qui change
- Un seul bouton, à droite des badges Julia / Candice (à la place de « Réinitialiser », supprimé) :
  le cache FFBB est lu une seule fois et les équipes de TOUTES les participantes sont mises à jour
  (phases, matchs, classements créés / mis à jour seuls). Un panneau détaille le résultat.
- Les phases sont affichées au-dessus des onglets Calendrier / Classement / Statistiques.
- Supprimés : « Gérer les phases », « Synchroniser » par phase, ID d'engagement, lien de poule,
  « Réinitialiser », saisie de matchs (amicaux) et phase « Matchs amicaux ».
- Les phases déjà saisies cette saison sont reconnues (même poule / même engagement) et réutilisées :
  feuilles de match, stats et effectifs sont conservés.

## Jamais d'écrasement d'une saison précédente
- poule dont les matchs ne sont pas de la saison en cours : ignorée ;
- seules les phases de la saison en cours sont lues / créées / modifiées ;
- un match déjà rattaché à une autre saison n'est jamais réécrit ;
- nettoyage limité aux matchs FFBB de la phase en cours ;
- un score déjà enregistré n'est pas effacé si la FFBB n'en publie pas encore.
