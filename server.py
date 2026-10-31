import csv, inspect, time
from ffbb_data_client import FFBBDataClient

c = FFBBDataClient.create()
print("Paramètres search_engagements :", inspect.signature(c.search_engagements))

def hits(res):
    return list(getattr(res, "hits", res) or [])

def g(o, *path):
    for k in path:
        if o is None:
            return None
        o = getattr(o, k, None)
    return o

def est_feminin(h):
    return str(g(h, "sexe") or "").lower().startswith("f")

def ligne(h):
    return {
        "club": g(h, "nom_club"), "code_club": g(h, "code_club"),
        "equipe": g(h, "nom"), "numero": g(h, "numero_equipe"),
        "categorie": g(h, "categorie", "libelle"), "niveau": g(h, "niveau", "libelle"),
        "competition": g(h, "id_competition", "nom"),
        "poule": g(h, "id_poule", "nom"), "poule_id": g(h, "id_poule", "id"),
        "engagement_id": g(h, "id"),
    }

resultat = []

# --- Méthode 1 : un filtre direct sur le comité du Rhône ---
print("\n=== Méthode 1 : filtre code_comite ===")
try:
    h = hits(c.search_engagements("", filter=['code_comite = "0069"']))
    print("équipes trouvées (comité 0069) :", len(h))
    print("valeurs de 'sexe' vues :", sorted({str(g(x, 'sexe')) for x in h}))
    resultat = [x for x in h if est_feminin(x) and g(x, "code_comite") == "0069"]
except Exception as ex:
    print("ERREUR", type(ex).__name__, str(ex)[:200])

# --- Méthode 2 : on liste les clubs du Rhône, puis leurs équipes une par une ---
if not resultat:
    print("\n=== Méthode 2 : club par club ===")
    clubs = {}
    for essai in [dict(filter=['code_comite = "0069"']), dict(filter=['codeComite = "0069"']), {}]:
        try:
            for q in (["ARA0069"] if not essai else [""]):
                for o in hits(c.search_organismes(q, **essai)):
                    code = str(g(o, "code") or "")
                    if code.startswith("ARA0069"):
                        clubs[code] = g(o, "nom")
            if clubs:
                print("clubs du Rhône trouvés :", len(clubs), "(essai :", essai or "texte ARA0069", ")")
                break
        except Exception as ex:
            print("essai", essai, "->", type(ex).__name__, str(ex)[:100])
    for code, nom in clubs.items():
        try:
            for x in hits(c.search_engagements(nom)):
                if g(x, "code_club") == code and est_feminin(x):
                    resultat.append(x)
        except Exception as ex:
            print("  erreur pour", nom, ":", str(ex)[:80])
        time.sleep(0.2)

print("\nÉquipes féminines du Rhône trouvées :", len(resultat))
rows = [ligne(x) for x in resultat]
for r in rows[:8]:
    print("  ", r["club"], "|", r["equipe"], "|", r["competition"], "|", r["poule"])
if rows:
    with open("equipes_feminines_rhone.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print("\nFichier écrit : equipes_feminines_rhone.csv")