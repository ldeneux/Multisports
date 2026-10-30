# Test local : vérifie que ffbb_data_client renvoie bien ce que l'app attend.
# Usage : python test_ffbb.py <ID_POULE>
import json, sys
from ffbb_data_client import FFBBDataClient

client = FFBBDataClient.create()
print("get_engagement dispo :", hasattr(client, "get_engagement"))

poule = client.get_poule(int(sys.argv[1]))
d = poule.model_dump(mode="json", by_alias=True) if hasattr(poule, "model_dump") else poule
print("Clés de la poule :", list(d.keys()))
r = (d.get("rencontres") or [])
print("Nb rencontres :", len(r), "| nb classements :", len(d.get("classements") or []))
if r:
    print("1re rencontre :", json.dumps(r[0], ensure_ascii=False, indent=2)[:1500])
