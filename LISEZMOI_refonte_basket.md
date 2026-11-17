# Refonte de l'onglet Basket (v5)

Copie chaque fichier de ce zip à la même place dans le projet (écrase l'ancien), puis :

1. Supabase > SQL Editor : exécuter `supabase/11-basket-sync-globale.sql` (si pas déjà fait) puis `supabase/12-clubs-region.sql`.
2. Paramètres > ligne Basket de chaque participante : « Équipes FFBB suivies cette saison » (ex. `U15F`).
3. GitHub > Actions > « Construire les .exe FFBB » > Run workflow : construit désormais 3 programmes.
   Télécharge l'artefact et place **MiseAJourFFBB_ClubsARA.exe** dans `public/` (comme MiseAJourFFBB_Club.exe).

## Calendriers & résultats (inchangé depuis la v4)
MiseAJourFFBB_Club.exe puis « Mettre à jour les calendriers & résultats » (toutes les participantes).

## Nouveau : clubs & équipes de toute la région Auvergne-Rhône-Alpes
Remplace « Import clubs du comité » (qui ne lisait qu'un comité et aucune équipe).
1. Double-clic sur MiseAJourFFBB_ClubsARA.exe (PC Windows, mêmes identifiants que l'autre programme, ~10 min) :
   il lit les clubs des 12 comités (Ain, Allier, Ardèche, Cantal, Drôme, Isère, Loire, Haute-Loire, Puy-de-Dôme,
   Rhône, Savoie, Haute-Savoie) puis la page de chaque club (nom, logo, équipes) et dépose le tout dans Supabase.
   Reprise possible : un club déposé depuis moins de 12 h n'est pas relu.
2. Onglet Basket > « Clubs & équipes de la région » > « Importer les clubs & équipes » : range les clubs dans
   la liste des clubs (jamais d'écrasement d'un champ déjà renseigné) et les équipes de la saison en cours dans
   la nouvelle table basketball_club_teams (les équipes d'une autre saison ne sont jamais réécrites).

⚠ Le programme ClubsARA lit les pages publiques de competitions.ffbb.com ; je n'ai pas pu les tester d'ici.
Au premier lancement, s'il ne trouve pas de clubs ou d'équipes, il enregistre une copie de la page dans
`%USERPROFILE%\.multisports-ffbb\diagnostic\` : envoie-la-moi et j'ajuste la lecture.

Le paquet npm `ffbb-api-client` n'est plus utilisé par l'appli : tu peux le retirer de package.json.
