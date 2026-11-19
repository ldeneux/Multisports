"""
MiseAJourFFBB_ClubsARA : relève sur competitions.ffbb.com TOUS les clubs de la région
Auvergne-Rhône-Alpes (les 12 comités) et leurs équipes, puis les dépose dans Supabase
(table ffbb_clubs_cache). Dans l'appli, le bouton « Importer les clubs & équipes » (onglet Basket)
les range ensuite dans la liste des clubs (logo, nom) et dans la liste des équipes.

Même principe que MiseAJourFFBB_Club (calendriers) : le site bloque les serveurs, pas ton PC.
Mêmes identifiants (mémorisés dans ~/.multisports-ffbb/config.json).
Écrit aussi dans ~/.multisports-ffbb/ :
  - MiseAJourFFBB_ClubsARA_rapport.csv : une ligne par club (nombre d'équipes, résultat) ;
  - diagnostic/ : copies des pages FFBB lues quand quelque chose n'a pas pu être trouvé.
Version script : `python push_ffbb_clubs_ara.py` (Python + `pip install requests`).
Durée : une dizaine de minutes (une page par club, avec une pause entre chaque).
"""
import csv
import getpass
import json
import os
import re
import sys
import time
from html import unescape
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse, urlencode

import requests

SUPABASE_URL = "https://khhwqaqjzfthytxuvsgf.supabase.co"        # ex. https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoaHdxYXFqemZ0aHl0eHV2c2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MTc2NzEsImV4cCI6MjEwMzM5MzY3MX0.kuffyiL80ONhtpy5dZKX9dGAHakFNgmF-6EK1re5AJU"   # ex. eyJ...

HEADERS_SITE = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "fr-FR,fr;q=0.9",
}
JOURNEES_A_LIRE = (1, 2)   # une page contient normalement toute la poule ; la 2e = sécurité


def saison_en_cours():
    now = datetime.now()
    fin = now.year + 1 if now.month >= 9 else now.year
    return f"{fin - 1}-{fin}"


def sb_headers(token=None, profile="multisports", write=False):
    h = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token or SUPABASE_ANON_KEY}"}
    h["Content-Profile" if write else "Accept-Profile"] = profile
    return h


class ConnexionRefusee(Exception):
    """E-mail ou mot de passe refusé par Supabase."""


CONFIG = Path.home() / ".multisports-ffbb" / "config.json"


def charger_config():
    try:
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    except Exception:
        return {}


def sauver_config(email, mot_de_passe):
    try:
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(json.dumps({"email": email, "password": mot_de_passe}), encoding="utf-8")
        try:
            os.chmod(CONFIG, 0o600)   # lisible par l'utilisateur seul (Mac/Linux)
        except Exception:
            pass
    except Exception:
        print("(Impossible de mémoriser les identifiants : ils seront redemandés la prochaine fois.)")


def oublier_config():
    try:
        CONFIG.unlink()
    except Exception:
        pass


def connexion(email, mot_de_passe):
    r = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                      headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
                      json={"email": email, "password": mot_de_passe}, timeout=30)
    if r.status_code in (400, 401):
        raise ConnexionRefusee()
    if r.status_code != 200:
        raise RuntimeError(f"Connexion à l'appli impossible ({r.status_code}) : {r.text[:200]}")
    return r.json()["access_token"]


def obtenir_token():
    """Identifiants mémorisés si possibles, sinon on les demande (3 essais)."""
    cfg = charger_config()
    if cfg.get("email") and cfg.get("password"):
        try:
            return connexion(cfg["email"], cfg["password"])
        except ConnexionRefusee:
            print("Les identifiants mémorisés ne fonctionnent plus : merci de les saisir à nouveau.")
            oublier_config()
    for _ in range(3):
        email = input("E-mail du compte de l'appli : ").strip()
        mot_de_passe = getpass.getpass("Mot de passe (rien ne s'affiche en tapant, c'est normal) : ")
        try:
            token = connexion(email, mot_de_passe)
        except ConnexionRefusee:
            print("E-mail ou mot de passe incorrect, réessaie.\n")
            continue
        sauver_config(email, mot_de_passe)
        return token
    raise RuntimeError("Trois essais incorrects. Demande les identifiants à la personne qui gère l'appli.")



# ----------------------------------------------------------------------------- la région
SITE = "https://competitions.ffbb.com"
DOSSIER = CONFIG.parent
PAUSE = 0.4            # secondes entre deux pages (on reste poli avec le site)
FRAICHEUR_H = 12       # un club déposé il y a moins de 12 h n'est pas relu (reprise après interruption)
LOT = 25               # nombre de clubs déposés d'un coup

# Comités de la ligue Auvergne-Rhône-Alpes (code FFBB = numéro du département sur 4 chiffres).
COMITES = {
    "0001": "Ain", "0003": "Allier", "0007": "Ardèche", "0015": "Cantal", "0026": "Drôme",
    "0038": "Isère", "0042": "Loire", "0043": "Haute-Loire", "0063": "Puy-de-Dôme",
    "0069": "Rhône", "0073": "Savoie", "0074": "Haute-Savoie",
}

RE_CLUB = re.compile(r"clubs/(ara\d{7})(?![0-9A-Za-z])", re.I)
RE_LOGO = re.compile(r'"logo"\s*:\s*\{\s*"id"\s*:\s*"([0-9a-fA-F-]{36})"')


def telecharger(url):
    time.sleep(PAUSE)
    r = requests.get(url, headers=HEADERS_SITE, timeout=30)
    if r.status_code != 200:
        blocage = " (blocage anti-robot du site, réessaie plus tard)" if r.status_code in (403, 429, 503) else ""
        raise RuntimeError(f"le site répond HTTP {r.status_code}{blocage}")
    return r.text


def decoder(html):
    """Texte de la page + flux Next.js décodé (où les guillemets du JSON ne sont plus échappés)."""
    flux = []
    for m in re.finditer(r'self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)', html):
        try:
            flux.append(json.loads(m.group(1)))
        except ValueError:
            pass
    txt = html + "\n" + "\n".join(flux)
    return txt.replace("\\/", "/").replace("&amp;", "&").replace("\\u0026", "&")


def titre(html):
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    return re.sub(r"\s+", " ", unescape(m.group(1))).strip() if m else ""


def sauver_diag(nom, contenu):
    try:
        d = DOSSIER / "diagnostic"
        d.mkdir(parents=True, exist_ok=True)
        (d / nom).write_text(contenu, encoding="utf-8")
    except Exception:
        pass


def sans_balises(s):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", s))).strip()


# ----------------------------------------------------------------------------- 1) la liste des clubs
def clubs_du_comite(comite):
    """Codes des clubs listés sur la page « clubs » du comité (pages suivantes si le site en a)."""
    codes = {}
    for page in range(1, 41):
        url = f"{SITE}/ligues/ara/comites/{comite}/clubs" + (f"?page={page}" if page > 1 else "")
        try:
            html = telecharger(url)
        except Exception as e:
            if page == 1:
                print(f"    page illisible : {e}")
            break
        trouves = [c.upper() for c in RE_CLUB.findall(decoder(html))]
        if page == 1 and not trouves:
            sauver_diag(f"liste_clubs_{comite}.html", html)
            print("    aucun club repéré dans la page (copie enregistrée dans le dossier diagnostic)")
            break
        nouveaux = [c for c in dict.fromkeys(trouves) if c not in codes]
        if not nouveaux:
            break
        for c in nouveaux:
            codes[c] = comite
    return list(codes)


# ----------------------------------------------------------------------------- 2) un club et ses équipes
def lire_club(code):
    comite = code[3:7]
    url = f"{SITE}/ligues/ara/comites/{comite}/clubs/{code.lower()}"
    html = telecharger(url)
    txt = decoder(html)

    nom = ""
    for motif in (r'"nom"\s*:\s*"([^"]{3,80})"[^{}]{0,400}?"code"\s*:\s*"' + code + '"',
                  r'"code"\s*:\s*"' + code + r'"[^{}]{0,400}?"nom"\s*:\s*"([^"]{3,80})"'):
        m = re.search(motif, txt, re.I)
        if m:
            nom = m.group(1)
            break
    if not nom:
        nom = re.split(r"\s+[|–-]\s+", titre(html))[0].strip()

    logo = None
    for m in re.finditer(code, txt, re.I):
        w = txt[max(0, m.start() - 800): m.end() + 800]
        lm = RE_LOGO.search(w)
        if lm:
            logo = lm.group(1)
            break

    equipes = []
    for eid in dict.fromkeys(re.findall(r"clubs/" + code.lower() + r"/equipes/(\d{6,})", txt, re.I)):
        nom_eq = ""
        m = re.search(r"equipes/" + eid + r'["\'][^>]*>(.*?)</a>', html, re.S | re.I)
        if m:
            nom_eq = sans_balises(m.group(1))
        if not nom_eq:
            m = re.search(r'"id"\s*:\s*"?' + eid + r'"?[^{}]{0,300}?"nom"\s*:\s*"([^"]{2,80})"', txt)
            if m:
                nom_eq = m.group(1)
        equipes.append({"engagement_id": eid, "nom": nom_eq})
    return {"nom": nom or code, "url": url, "logo_asset": logo, "equipes": equipes}, html


def deja_deposes(token):
    """Clubs déposés récemment (pour ne pas tout relire après une interruption)."""
    limite = datetime.now(timezone.utc).timestamp() - FRAICHEUR_H * 3600
    res = set()
    try:
        r = requests.get(f"{SUPABASE_URL}/rest/v1/ffbb_clubs_cache", params={"select": "club_code,fetched_at", "limit": 5000},
                         headers=sb_headers(token), timeout=30)
        if r.status_code == 200:
            for x in r.json():
                try:
                    t = datetime.fromisoformat(x["fetched_at"].replace("Z", "+00:00")).timestamp()
                except Exception:
                    continue
                if t >= limite:
                    res.add(x["club_code"])
        elif r.status_code in (404, 400):
            raise RuntimeError("La table ffbb_clubs_cache n'existe pas : exécute supabase/12-clubs-region.sql dans Supabase.")
    except requests.exceptions.RequestException:
        raise
    return res


def deposer(etat, lignes):
    if not lignes:
        return
    h = sb_headers(etat["token"], write=True)
    h.update({"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
    url = f"{SUPABASE_URL}/rest/v1/ffbb_clubs_cache?on_conflict=club_code"
    r = requests.post(url, headers=h, json=lignes, timeout=120)
    if r.status_code == 401:   # jeton expiré : on se reconnecte (identifiants mémorisés)
        etat["token"] = obtenir_token()
        h = sb_headers(etat["token"], write=True)
        h.update({"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
        r = requests.post(url, headers=h, json=lignes, timeout=120)
    if r.status_code in (404, 400) and "ffbb_clubs_cache" in r.text:
        raise RuntimeError("La table ffbb_clubs_cache n'existe pas : exécute supabase/12-clubs-region.sql dans Supabase.")
    if r.status_code not in (200, 201, 204):
        raise RuntimeError(f"écriture Supabase ({r.status_code}) : {r.text[:200]}")


def main():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError("Renseigne SUPABASE_URL et SUPABASE_ANON_KEY en haut du fichier.")
    etat = {"token": obtenir_token()}
    print(f"\nRégion Auvergne-Rhône-Alpes - {len(COMITES)} comités")

    # --- 1) Les clubs de chaque comité -------------------------------------------------------
    print("\n1/2  Liste des clubs de chaque comité ...")
    codes = []
    for comite, nom in COMITES.items():
        trouves = clubs_du_comite(comite)
        print(f"  {comite} {nom} : {len(trouves)} club(s)")
        codes.extend(c for c in trouves if c not in codes)
    print(f"  Total : {len(codes)} club(s).")
    if not codes:
        print("  Aucun club trouvé : les pages enregistrées dans le dossier diagnostic permettent de comprendre pourquoi.")
        return

    # --- 2) Chaque club : nom, logo, équipes ---------------------------------------------------
    recents = deja_deposes(etat["token"])
    if recents:
        print(f"\n  {len(recents)} club(s) déjà déposé(s) depuis moins de {FRAICHEUR_H} h : ils ne sont pas relus.")
    print("\n2/2  Lecture de chaque club et de ses équipes ...")
    rapport, lot, diag_faite = [], [], False
    total = len(codes)
    try:
        for i, code in enumerate(codes, 1):
            ligne = {"code": code, "comite": code[3:7], "nom": "", "equipes": "", "statut": ""}
            if code in recents:
                ligne["statut"] = "OK (déjà déposé)"
                rapport.append(ligne)
                continue
            try:
                data, html = lire_club(code)
                ligne.update(nom=data["nom"], equipes=len(data["equipes"]))
                if not data["equipes"] and not diag_faite:
                    sauver_diag(f"page_club_{code}.html", html)   # une seule copie, pour comprendre
                    diag_faite = True
                lot.append({"club_code": code, "comite_code": code[3:7], "data": data,
                            "fetched_at": datetime.now(timezone.utc).isoformat()})
                ligne["statut"] = "OK"
            except Exception as e:
                ligne["statut"] = f"ERREUR : {e}"
            rapport.append(ligne)
            if len(lot) >= LOT:
                deposer(etat, lot)
                lot = []
            if i % 10 == 0 or i == total:
                print(f"  [{i}/{total}] {ligne['nom'] or code} - {ligne['statut']}")
    finally:
        try:
            deposer(etat, lot)   # dépose ce qui reste, même en cas d'interruption
        except Exception as e:
            print(f"  (dernier lot non déposé : {e})")

    # --- Bilan ---------------------------------------------------------------------------
    ok = sum(1 for r in rapport if r["statut"].startswith("OK"))
    erreurs = len(rapport) - ok
    nb_equipes = sum(int(r["equipes"] or 0) for r in rapport if r["statut"] == "OK")
    try:
        DOSSIER.mkdir(parents=True, exist_ok=True)
        chemin = DOSSIER / "MiseAJourFFBB_ClubsARA_rapport.csv"
        with open(chemin, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=["code", "comite", "nom", "equipes", "statut"])
            w.writeheader()
            w.writerows(rapport)
        print(f"\nRapport : {chemin}")
    except Exception:
        pass
    print(f"\n{ok} club(s) déposé(s) ({nb_equipes} équipe(s)), {erreurs} en erreur.")
    if erreurs or nb_equipes == 0:
        print(f"En cas de problème, envoie le contenu du dossier {DOSSIER} à la personne qui gère l'appli.")
    else:
        print("Terminé. Dans l'appli (onglet Basket), clique sur « Importer les clubs & équipes ».")


def lancer():
    code = 0
    try:
        main()
    except requests.exceptions.RequestException:
        print("\nERREUR : pas de connexion Internet (ou service injoignable). Vérifie ta connexion et recommence.")
        code = 1
    except KeyboardInterrupt:
        code = 1
    except Exception as e:
        print(f"\nERREUR : {e}")
        code = 1
    # Programme double-cliqué : on garde la fenêtre ouverte pour lire le résultat.
    if getattr(sys, "frozen", False):
        try:
            input("\nAppuie sur Entrée pour fermer cette fenêtre...")
        except EOFError:
            pass
    sys.exit(code)


if __name__ == "__main__":
    lancer()
