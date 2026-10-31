"""
Annuaire FFBB du Rhône : récupère les clubs et TOUTES leurs équipes engagées
(garçons et filles) via la recherche FFBB, puis les range dans les tables
EXISTANTES de l'app : basketball_clubs et basketball_club_teams.

Règles de sécurité (même esprit que la synchro de l'app) :
  - rien n'est jamais supprimé ;
  - sur un club déjà connu, un champ DÉJÀ renseigné (saisie manuelle, synchro
    précédente) n'est jamais écrasé : on ne remplit que ce qui manque ;
  - les CSV (clubs_rhone.csv, equipes_rhone.csv) et des fichiers SQL
    d'import (import_equipes_1.sql...) sont toujours écrits ;
  - l'envoi dans Supabase n'a lieu que si SUPABASE_URL et SUPABASE_SERVICE_KEY
    sont définies.

Prérequis : avoir exécuté 8-annuaire-ffbb.sql (ajout de colonnes).

Usage (PowerShell) :
  $env:SUPABASE_URL="https://xxxx.supabase.co"
  $env:SUPABASE_SERVICE_KEY="clé service_role (Settings > API) — ne jamais la publier"
  python annuaire_ffbb.py
"""
import csv
import os
import re
import time
from datetime import date, datetime, timezone

import httpx
from ffbb_data_client import FFBBDataClient

COMITE = "0069"  # Rhône et Métropole de Lyon
CENTRES = [(45.76, 4.84), (45.99, 4.72), (45.90, 4.43), (45.59, 4.77), (45.63, 4.45), (45.75, 5.00)]

today = date.today()
annee = today.year if today.month >= 7 else today.year - 1
SAISON = f"{annee}-{annee + 1}"
MAINTENANT = datetime.now(timezone.utc).isoformat()

client = FFBBDataClient.create()


def hits(res):
    return list(getattr(res, "hits", res) or [])


def g(obj, *path):
    for key in path:
        if obj is None:
            return None
        obj = getattr(obj, key, None)
    return obj


def txt(v):
    if v is None:
        return None
    if isinstance(v, (str, int, float)):
        return str(v)
    for k in ("libelle", "nom", "label", "name"):
        x = getattr(v, k, None)
        if x:
            return str(x)
    return None


def premier(*valeurs):
    for v in valeurs:
        t = txt(v)
        if t:
            return t
    return None


def club_key(nom):
    """Même règle que l'app (stripTeamSuffix) : on retire le suffixe " - 2"."""
    return re.sub(r"\s*-\s*\d+\s*$", "", (nom or "").strip())


# ---------------------------------------------------------------- 1) Les clubs
organismes = {}
for lat, lng in CENTRES:
    res = []
    for limite in (1000, 200, 50):
        try:
            res = hits(client.search_organismes_by_geo(lat=lat, lng=lng, radius_km=25, limit=limite))
            break
        except Exception:
            res = []
    for o in res:
        if str(g(o, "code") or "").startswith(f"ARA{COMITE}"):
            organismes[str(g(o, "id"))] = o
    print(f"zone {(lat, lng)} : {len(res)} clubs reçus, {len(organismes)} clubs du Rhône cumulés")

if organismes:
    try:
        print("\nExemple de fiche club (pour vérification) :")
        print(str(next(iter(organismes.values())).to_dict())[:900])
    except Exception:
        pass

# Fiches club prêtes pour la table (dédoublonnées par club_key, comme l'app)
clubs_par_cle = {}
for oid, o in organismes.items():
    cle = club_key(g(o, "nom"))
    if not cle or cle in clubs_par_cle:
        continue
    adresse = premier(g(o, "adresse"))
    commune = premier(g(o, "commune"), g(o, "cartographie", "ville"))
    clubs_par_cle[cle] = {
        "club_key": cle,
        "display_name": g(o, "nom"),
        "ffbb_organisme_id": oid,
        "logo_asset": txt(g(o, "logo", "id")),
        "gymnase": None,
        "adresse": ", ".join(p for p in (adresse, commune) if p) or None,
        "ffbb_code": g(o, "code"),
        "commune": commune,
        "code_postal": premier(g(o, "cartographie", "code_postal"), g(o, "cartographie", "codePostal"),
                               g(o, "commune", "code_postal"), g(o, "commune", "codePostal")),
        "mail": txt(g(o, "mail")),
        "telephone": txt(g(o, "telephone")),
        "lat": g(o, "geo", "lat"),
        "lng": g(o, "geo", "lng"),
    }
code_vers_cle = {c["ffbb_code"]: cle for cle, c in clubs_par_cle.items() if c["ffbb_code"]}

# ------------------------------------------------------- 2) Les équipes (toutes)
engagements = {}
print("\nRécupération des équipes, club par club...")
for i, o in enumerate(organismes.values(), 1):
    try:
        for x in hits(client.search_engagements(g(o, "nom"))):
            if g(x, "code_comite") == COMITE and g(x, "id"):
                engagements[str(g(x, "id"))] = x
    except Exception as ex:
        print("  erreur", g(o, "nom"), str(ex)[:60])
    if i % 25 == 0:
        print(f"  {i}/{len(organismes)} clubs traités, {len(engagements)} équipes")
    time.sleep(0.15)

equipes = []
sans_club = 0
for eid, x in engagements.items():
    cle = code_vers_cle.get(g(x, "code_club"))
    if not cle:
        sans_club += 1
        continue
    numero = txt(g(x, "numero_equipe"))
    nom_club = g(x, "nom_club") or clubs_par_cle[cle]["display_name"]
    equipes.append({
        "_club_key": cle,
        "ffbb_engagement_id": eid,
        # Même format que les noms d'équipes FFBB dans les matchs : "CLUB - 3"
        "team_name": f"{nom_club} - {numero}" if numero else nom_club,
        "category": g(x, "categorie", "libelle"),
        "competition_name": g(x, "id_competition", "nom"),
        "numero_equipe": numero,
        "sexe": g(x, "sexe"),
        "niveau": g(x, "niveau", "libelle"),
        "competition_id": txt(g(x, "id_competition", "id")),
        "poule_id": txt(g(x, "id_poule", "id")),
        "poule_nom": g(x, "id_poule", "nom"),
        "season": SAISON,
        "synced_at": MAINTENANT,
    })

# -------------------------------------------------------------- 3) Fichiers CSV
def ecrire_csv(nom, lignes):
    if not lignes:
        return
    with open(nom, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(lignes[0]))
        w.writeheader()
        w.writerows(lignes)
    print(f"Fichier écrit : {nom} ({len(lignes)} lignes)")

ecrire_csv("clubs_rhone.csv", list(clubs_par_cle.values()))
# Dans le CSV, la colonne de liaison s'appelle club_key (sans underscore) pour
# pouvoir relier chaque équipe à son club lors d'un import manuel dans Supabase.
ecrire_csv("equipes_rhone.csv",
           [{"club_key": e["_club_key"], **{k: v for k, v in e.items() if k != "_club_key"}} for e in equipes])

# ------------------------------------------------ Fichiers SQL (import sans clé)
# Alternative à l'envoi direct et à l'import CSV : des fichiers .sql à coller
# dans Supabase > SQL Editor. Le lien équipe -> club se fait par club_key (jointure
# avec basketball_clubs, qui doit donc déjà contenir les clubs). Ajout / mise à
# jour uniquement, rien n'est supprimé.
COLS_SQL = ["club_key", "ffbb_engagement_id", "team_name", "category", "competition_name",
            "numero_equipe", "sexe", "niveau", "competition_id", "poule_id", "poule_nom", "season"]


def lit(v):
    """Valeur -> texte SQL (apostrophes doublées, NULL si vide)."""
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def ecrire_sql(lignes, taille_lot=1000):
    fichiers = []
    for n, debut in enumerate(range(0, len(lignes), taille_lot), 1):
        lot = lignes[debut:debut + taille_lot]
        valeurs = ",\n".join(
            "(" + ", ".join(lit(e["_club_key"] if c == "club_key" else e[c]) for c in COLS_SQL) + ")"
            for e in lot
        )
        nom = f"import_equipes_{n}.sql"
        with open(nom, "w", encoding="utf-8") as f:
            f.write(
                f"-- Import des equipes, lot {n} ({len(lot)} lignes). Ajout / mise a jour, aucune suppression.\n"
                "insert into multisports.basketball_club_teams\n"
                "  (club_id, ffbb_engagement_id, team_name, category, competition_name, numero_equipe,\n"
                "   sexe, niveau, competition_id, poule_id, poule_nom, season, synced_at)\n"
                "select c.id, v.ffbb_engagement_id, v.team_name, v.category, v.competition_name, v.numero_equipe,\n"
                "       v.sexe, v.niveau, v.competition_id, v.poule_id, v.poule_nom, v.season, now()\n"
                "from (values\n" + valeurs + "\n) as v(" + ", ".join(COLS_SQL) + ")\n"
                "join multisports.basketball_clubs c on c.club_key = v.club_key\n"
                "on conflict (ffbb_engagement_id) do update set\n"
                "  club_id = excluded.club_id, team_name = excluded.team_name, category = excluded.category,\n"
                "  competition_name = excluded.competition_name, numero_equipe = excluded.numero_equipe,\n"
                "  sexe = excluded.sexe, niveau = excluded.niveau, competition_id = excluded.competition_id,\n"
                "  poule_id = excluded.poule_id, poule_nom = excluded.poule_nom, season = excluded.season,\n"
                "  synced_at = now();\n"
            )
        fichiers.append(nom)
    print("Fichiers SQL écrits :", ", ".join(fichiers))


ecrire_sql(equipes)

feminines = sum(1 for e in equipes if str(e["sexe"] or "").lower().startswith("f"))
print(f"\nBilan : {len(clubs_par_cle)} clubs, {len(equipes)} équipes engagées dont {feminines} féminines "
      f"(saison {SAISON}). Équipes ignorées faute de club reconnu : {sans_club}.")

# ------------------------------------------------------------ 4) Envoi Supabase
url = os.environ.get("SUPABASE_URL", "").rstrip("/")
cle_api = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not url or not cle_api:
    print("\nSUPABASE_URL / SUPABASE_SERVICE_KEY absentes : pas d'envoi, CSV seulement.")
    raise SystemExit(0)

base = {
    "apikey": cle_api,
    "Authorization": f"Bearer {cle_api}",
    "Accept-Profile": "multisports",    # lecture dans le schéma de l'app
    "Content-Profile": "multisports",   # écriture dans le schéma de l'app
}


def lire_tout(table, colonnes):
    """Lit toute une table par pages de 1000 lignes."""
    lignes, debut = [], 0
    while True:
        r = httpx.get(f"{url}/rest/v1/{table}?select={colonnes}", timeout=60.0,
                      headers={**base, "Range-Unit": "items", "Range": f"{debut}-{debut + 999}"})
        if r.status_code >= 300:
            raise RuntimeError(f"lecture {table} (HTTP {r.status_code}) : {r.text[:300]}")
        lot = r.json()
        lignes += lot
        if len(lot) < 1000:
            return lignes
        debut += 1000


def envoyer(table, cle_conflit, lignes):
    for debut in range(0, len(lignes), 200):
        r = httpx.post(f"{url}/rest/v1/{table}?on_conflict={cle_conflit}", timeout=60.0, json=lignes[debut:debut + 200],
                       headers={**base, "Content-Type": "application/json",
                                "Prefer": "resolution=merge-duplicates,return=minimal"})
        if r.status_code >= 300:
            raise RuntimeError(f"écriture {table} (HTTP {r.status_code}) : {r.text[:300]}")
    print(f"  {table} : {len(lignes)} lignes envoyées")


try:
    print("\nEnvoi dans Supabase (ajout / complétion, aucune suppression)...")
    colonnes_club = ["display_name", "ffbb_organisme_id", "logo_asset", "gymnase", "adresse",
                     "ffbb_code", "commune", "code_postal", "mail", "telephone", "lat", "lng"]
    existants = {r["club_key"]: r for r in lire_tout("basketball_clubs", "club_key," + ",".join(colonnes_club))}

    a_envoyer = []
    for cle, nouveau in clubs_par_cle.items():
        ex = existants.get(cle, {})
        ligne = {"club_key": cle, "updated_at": MAINTENANT}
        for col in colonnes_club:
            # Valeur déjà en base = prioritaire ; sinon celle de la FFBB.
            ligne[col] = ex.get(col) if ex.get(col) not in (None, "") else nouveau[col]
        a_envoyer.append(ligne)
    envoyer("basketball_clubs", "club_key", a_envoyer)

    ids = {r["club_key"]: r["id"] for r in lire_tout("basketball_clubs", "id,club_key")}
    equipes_db = []
    for e in equipes:
        club_id = ids.get(e["_club_key"])
        if not club_id:
            continue
        ligne = {k: v for k, v in e.items() if not k.startswith("_")}
        ligne["club_id"] = club_id
        equipes_db.append(ligne)
    envoyer("basketball_club_teams", "ffbb_engagement_id", equipes_db)
    print("Terminé.")
except Exception as ex:
    print("\nERREUR pendant l'envoi :", ex)
    print("Les CSV sont écrits : tu peux les importer à la main (Table Editor > Import data from CSV).")