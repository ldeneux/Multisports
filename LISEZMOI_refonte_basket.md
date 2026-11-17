# Refonte de l'onglet Basket (v6)

Copie chaque fichier de ce zip à la même place dans le projet (écrase l'ancien), puis :

1. Supabase > SQL Editor : `supabase/11-basket-sync-globale.sql` (si pas déjà fait) puis `supabase/12-clubs-region.sql`.
2. Paramètres > ligne Basket de chaque participante : « Équipes FFBB suivies cette saison » (ex. `U15F`).
3. GitHub > Actions > « Construire les .exe FFBB » > Run workflow, puis remplace dans `public/` :
   MiseAJourFFBB_Club.exe (corrigé, voir ci-dessous) et MiseAJourFFBB_ClubsARA.exe (nouvelle méthode).

## v6
- MiseAJourFFBB_ClubsARA.exe : le site n'a pas de page « liste des clubs d'un comité » (404). Le programme cherche
  donc les clubs numéro par numéro (ARA0069001, ARA0069002...) pour les 12 comités, s'arrête après 120 numéros
  vides de suite, et mémorise les numéros vides (clubs_absents.json) : 10 à 30 minutes la première fois, bien
  moins ensuite. Une page qui répond 200 sans contenir le code du club est ignorée (copie dans diagnostic/).
- MiseAJourFFBB_Club.exe : une équipe engagée dans une coupe (ex. Coupe du Rhône, page_equipe_200000005382889.html)
  n'avait pas de lien « poule » dans sa page. La poule est maintenant lue dans la liste des matchs de l'équipe
  (idPoule + phase), et toutes les poules valides de l'équipe sont déposées (ex. 1er et 2e tour de coupe).
