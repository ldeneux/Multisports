"""
Pont Python pour la synchro FFBB (version « recherche »).

Pourquoi : l'API détaillée de la FFBB (poules, classements, scores) est
bloquée par leur pare-feu (BunnyCDN WAF). Seule la RECHERCHE (Meilisearch)
répond encore, mais elle ne contient qu'une fenêtre glissante d'environ deux
semaines de matchs, et sans les scores. Ce fichier interroge cette recherche
avec ffbb_data_client et renvoie les matchs de la poule de l'équipe demandée.

Appel : GET /api/ffbb?engagement_id=123&saison=26-27[&poule_id=456]
Sécurité : l'en-tête x-ffbb-secret doit valoir la variable FFBB_PROXY_SECRET.
"""
import os

# Sur Vercel, seul /tmp est inscriptible (la librairie met des réponses en cache).
os.environ.setdefault("HOME", "/tmp")
os.environ.setdefault("XDG_CACHE_HOME", "/tmp")

import hmac
import json
import traceback
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from ffbb_data_client import FFBBDataClient


def g(obj, *path):
    """Lit obj.a.b.c sans planter si un maillon manque (None)."""
    for key in path:
        if obj is None:
            return None
        obj = getattr(obj, key, None)
    return obj


def sid(value):
    return None if value is None else str(value)


def normalise(h):
    """Un match de la recherche -> un dict simple, lu par le code JavaScript."""
    d = getattr(h, "date_rencontre", None)
    # Convention de l'appli : l'heure de Paris est enregistrée telle quelle
    # (16:30 reste 16:30), étiquetée UTC. L'affichage et le flux agenda (.ics)
    # s'appuient là-dessus : ne PAS convertir vers un vrai fuseau.
    date_iso = d.strftime("%Y-%m-%dT%H:%M:%S") + "Z" if d is not None else None
    return {
        "id": sid(h.id),
        "date": date_iso,
        "journee": g(h, "numero_journee"),
        "equipe1": {
            "nom": g(h, "nom_equipe1"),
            "engagement_id": sid(g(h, "id_engagement_equipe1", "id")),
            "organisme_id": sid(g(h, "id_organisme_equipe1", "id")),
            "organisme_nom": g(h, "id_organisme_equipe1", "nom"),
            "logo": sid(g(h, "id_organisme_equipe1", "logo", "id")),
        },
        "equipe2": {
            "nom": g(h, "nom_equipe2"),
            "engagement_id": sid(g(h, "id_engagement_equipe2", "id")),
            "organisme_id": sid(g(h, "id_organisme_equipe2", "id")),
            "organisme_nom": g(h, "id_organisme_equipe2", "nom"),
            "logo": sid(g(h, "id_organisme_equipe2", "logo", "id")),
        },
        "salle": g(h, "salle", "libelle"),
        "ville": g(h, "salle", "cartographie", "ville"),
        "poule_id": sid(g(h, "id_poule", "id")),
        "poule_nom": g(h, "id_poule", "nom"),
        "competition_nom": g(h, "competition_id", "nom"),
        "competition_logo": sid(
            g(h, "competition_id", "type_competition_generique", "logo", "id")
        ),
    }


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        expected = os.environ.get("FFBB_PROXY_SECRET", "")
        if not expected:
            return self._send(500, {"error": "FFBB_PROXY_SECRET non défini côté serveur"})
        if not hmac.compare_digest(expected, self.headers.get("x-ffbb-secret", "")):
            return self._send(401, {"error": "secret invalide"})

        params = parse_qs(urlparse(self.path).query)
        engagement_id = (params.get("engagement_id") or [None])[0]
        poule_id = (params.get("poule_id") or [None])[0]
        saison = (params.get("saison") or [None])[0]  # ex. "26-27"
        if not engagement_id:
            return self._send(400, {"error": "engagement_id requis"})

        try:
            client = FFBBDataClient.create()
            flt = [f'saison.code = "{saison}"'] if saison else None
            res = client.search_rencontres("", filter=flt)
            hits = list(getattr(res, "hits", res) or [])
            matchs = [normalise(h) for h in hits]

            # Poule : celle fournie, sinon celle des matchs où joue notre équipe.
            if not poule_id:
                for m in matchs:
                    if engagement_id in (m["equipe1"]["engagement_id"], m["equipe2"]["engagement_id"]):
                        poule_id = m["poule_id"]
                        break

            if not poule_id:
                return self._send(404, {
                    "error": "Aucun match de cette équipe dans la fenêtre de la recherche FFBB "
                             "(environ 1 semaine avant et après aujourd'hui) : poule non déterminable.",
                    "total_fenetre": len(matchs),
                })

            de_la_poule = [m for m in matchs if m["poule_id"] == str(poule_id)]
            return self._send(200, {
                "poule_id": str(poule_id),
                "total_fenetre": len(matchs),
                "rencontres": de_la_poule,
            })
        except Exception as exc:
            return self._send(502, {"error": f"{type(exc).__name__}: {exc}",
                                    "trace": traceback.format_exc()[-600:]})
