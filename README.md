# Sport Famille

Application privée multisport pour suivre Candice, Amandine et Julia :
participants, sports pratiqués (basket, natation, course à pied, triathlon,
plongée, et plus), et leurs documents (diplômes, licences, certificats).

Stack : **Next.js 14** (App Router) + **Supabase** (base de données,
authentification, stockage de fichiers) + **Tailwind CSS**, déployée sur
**Vercel**.

---

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) → **New project**.
2. Une fois le projet créé, ouvre **SQL Editor** (menu de gauche).
3. Exécute, **dans l'ordre**, les 3 scripts fournis dans le dossier `supabase/` :
   1. `schema.sql` → crée toutes les tables (participants, sports, affectations,
      documents) + sécurise l'accès (RLS). Si une ancienne version de l'appli
      existait déjà, ce script supprime proprement les anciennes tables.
   2. `seed.sql` → crée les 5 sports principaux, Candice/Amandine/Julia, et
      leurs affectations sportives de départ
   3. `storage.sql` → crée l'espace de stockage pour les photos de documents

   Pour chaque script : ouvre **New query**, colle le contenu du fichier, clique **Run**.

4. Va dans **Authentication → Users → Add user** et crée le compte
   familial (email + mot de passe) qui servira à se connecter à l'appli.
   Coche "Auto Confirm User" pour ne pas avoir à valider l'email.

5. Va dans **Project Settings → API** et note :
   - **Project URL**
   - **anon public key**

   Tu en auras besoin à l'étape 3.

## 2. Récupérer le code

Dézippe l'archive du projet, puis ouvre un terminal dedans :

```bash
cd sport-famille-app
npm install
```

## 3. Configurer les variables d'environnement

Copie `.env.local.example` en `.env.local` :

```bash
cp .env.local.example .env.local
```

Ouvre `.env.local` et colle les 2 valeurs récupérées à l'étape 1.5 :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Teste en local :

```bash
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000) et connecte-toi avec le
compte créé à l'étape 1.4.

## 4. Déployer sur Vercel

### Option A — via GitHub (recommandé)

1. Crée un nouveau repo GitHub et pousse le code :
   ```bash
   git init
   git add .
   git commit -m "Sport Famille — première version"
   git branch -M main
   git remote add origin https://github.com/<ton-compte>/sport-famille.git
   git push -u origin main
   ```
2. Va sur [vercel.com](https://vercel.com) → **Add New → Project** → importe le repo.
3. Dans **Environment Variables**, ajoute les 2 mêmes variables que dans `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Clique **Deploy**.

### Option B — via la CLI Vercel

```bash
npm install -g vercel
vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

## 5. Après le déploiement

- L'app est protégée : sans compte, impossible d'accéder à quoi que ce soit
  (redirection automatique vers `/login`).
- Pour créer un accès supplémentaire (ex. pour Candice), ajoute un nouvel
  utilisateur dans **Supabase → Authentication → Users**.
- Pour ajouter une 4e fille ou modifier une date de naissance, tu peux le
  faire directement dans **Supabase → Table Editor → children**.

---

## 6. Synchronisation FFBB (Basket) — expérimentale

L'onglet Basket peut aller chercher automatiquement les matchs d'une équipe
sur competitions.ffbb.com, via une librairie communautaire
(`ffbb-api-client`) qui s'appuie sur l'API interne de la FFBB — **ce n'est
pas une API officielle**, elle peut casser sans préavis si la FFBB change
son système.

Pour que ça fonctionne pour une affectation (ex. "Candice — Basket") :

1. Ouvre l'onglet **Basket**.
2. Dans le champ **ID FFBB (engagement)**, colle l'identifiant numérique
   présent à la fin de l'URL de l'équipe sur competitions.ffbb.com
   (ex. `.../equipes/200000005251991` → `200000005251991`). L'appli essaie
   aussi de le déduire automatiquement du lien renseigné dans Paramètres,
   mais ce n'est pas garanti.
3. Clique **Synchroniser FFBB**.

Si ça échoue, un message d'erreur s'affiche sous le participant concerné
(ID incorrect, poule introuvable, etc.) — dans ce cas, la saisie manuelle
des matchs (bouton "Ajouter un match manuellement") reste toujours possible.

## 7. Synchronisation FFN (Natation) — expérimentale

Même principe que pour le basket, mais côté natation : l'onglet Natation va
chercher les **Meilleures Performances Personnelles** publiées sur
ffn.extranat.fr (page publique "Rechercher des Perf."), pour les mettre à
jour à chaque synchro. Ce n'est pas non plus une API officielle — c'est une
page web publique dont on extrait le tableau de résultats, donc ça peut
casser si la FFN change sa page.

1. Ouvre l'onglet **Natation**.
2. Va sur `ffn.extranat.fr/webffn/nat_recherche.php?idact=nat`, cherche la
   nageuse par nom + club, ouvre sa fiche : son **ID FFN** est le nombre
   entre crochets à côté de son nom (ex. `DENEUX Amandine (2015) FRA
   [4432567]` → ID = `4432567`).
3. Colle cet ID dans le champ **ID FFN** de l'appli → **Enregistrer**.
4. Clique **Synchroniser FFN**.

Ça récupère un résultat par épreuve (ex. "100 Dos") et par bassin (25m/50m)
— à chaque synchro, le temps est mis à jour s'il y a une meilleure
performance depuis la dernière fois. La saisie manuelle reste disponible en
secours.

## Structure du projet

```
app/
  login/              page de connexion
  (protected)/        pages nécessitant une connexion
    page.js             accueil (vue d'ensemble des participants)
    basket/              calendrier, résultats et synchro FFBB (basket)
    natation/            performances et synchro FFN (natation)
    [sportSlug]/         page générique Course à pied / Triathlon /
                          Plongée / Autres sports
    documents/           diplômes, licences, certificats multisport
    parametres/          gestion des participants, sports, affectations
components/           barre de navigation
lib/supabase/         connexion à Supabase (client + serveur)
supabase/              scripts SQL à exécuter dans Supabase
```

Le contenu détaillé des autres sports (course à pied, triathlon, plongée)
arrivera dans une prochaine étape — basket et natation sont les deux
premiers modules complets.

## Évolutions possibles

- Calendriers et résultats détaillés par sport (matchs de basket avec stats
  par quart-temps, courses de natation avec chronos, courses à pied,
  triathlons).
- Import automatique depuis les sites fédéraux (FFBB, FFN...) — aujourd'hui
  les liens sont juste enregistrés en référence dans Paramètres.
- Graphiques de progression.
- Rappels/notifications avant un événement ou l'expiration d'un document.
- Comptes séparés par participant avec accès en lecture seule.
