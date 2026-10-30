from ffbb_data_client import FFBBDataClient

c = FFBBDataClient.create()
res = c.search_rencontres("", filter=['saison.code = "26-27"'])
hits = list(getattr(res, "hits", res) or [])

def org_id(h, n):
    o = getattr(h, f"id_organisme_equipe{n}", None)
    return str(o.id) if o is not None else None

def poule_id(h):
    p = getattr(h, "id_poule", None)
    return str(p.id) if p is not None else None

club = [h for h in hits if "11165" in (org_id(h, 1), org_id(h, 2))]
poule = [h for h in hits if poule_id(h) == "200000003055061"]
print("Matchs d'Olympic Sathonay :", len(club), "| matchs de la poule D3 A :", len(poule))
for h in (club or poule)[:8]:
    print("  ", h.date_rencontre, "|", h.nom_equipe1, "vs", h.nom_equipe2)

# Les scores : champs d'un match déjà passé (avant aujourd'hui)
passes = [h for h in (club or poule or hits) if h.date_rencontre and h.date_rencontre.isoformat() < "2026-10-30"]
h0 = (passes or club or poule or hits)[0]
print("\nMatch observé :", h0.date_rencontre, h0.nom_equipe1, "vs", h0.nom_equipe2)
for a in dir(h0):
    if not a.startswith("_") and not callable(getattr(h0, a)):
        print(f"  {a} = {str(getattr(h0, a))[:80]}")