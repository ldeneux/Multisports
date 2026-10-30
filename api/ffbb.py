"""
Petit "pont" Python pour la synchro FFBB.

Pourquoi : l'app est en JavaScript (Next.js) alors que la librairie qui marche
encore (ffbb_data_client) est en Python. Vercel sait faire tourner un fichier
Python placé dans /api à côté de Next.js : l'app l'appelle comme une mini-API
interne, et ce fichier renvoie la poule + le classement en JSON.

Appel : GET /api/ffbb?engagement_id=123&poule_id=456   (poule_id facultatif)
Sécurité : l'en-tête x-ffbb-secret doit valoir la variable FFBB_PROXY_SECRET.
"""
import os

# Sur Vercel, seul /tmp est inscriptible : la librairie met ses réponses en
# cache (SQLite) -> on lui indique /tmp avant de l'importer.
os.environ.setdefault("HOME", "/tmp")
os.environ.setdefault("XDG_CACHE_HOME", "/tmp")

import hmac
import json
import traceback
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from ffbb_data_client import FFBBDataClient


def to_plain(obj):
    """Transforme un modèle Pydantic en dict JSON (avec les noms d'origine de l'API)."""
    if obj is None:
        return None
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json", by_alias=True)
    return obj


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # 1) Contrôle du secret (sinon n'importe qui pourrait appeler l'URL)
        expected = os.environ.get("FFBB_PROXY_SECRET", "")
        given = self.headers.get("x-ffbb-secret", "")
        if not expected:
            return self._send(500, {"error": "FFBB_PROXY_SECRET non défini côté serveur"})
        if not hmac.compare_digest(expected, given):
            return self._send(401, {"error": "secret invalide"})

        # 2) Lecture des paramètres
        params = parse_qs(urlparse(self.path).query)
        engagement_id = (params.get("engagement_id") or [None])[0]
        poule_id = (params.get("poule_id") or [None])[0]
        if not engagement_id and not poule_id:
            return self._send(400, {"error": "engagement_id ou poule_id requis"})

        try:
            client = FFBBDataClient.create()
            engagement = None

            # 3) Si on ne connaît pas encore la poule, on la déduit de l'engagement
            if not poule_id:
                get_engagement = getattr(client, "get_engagement", None)
                if get_engagement is None:
                    return self._send(
                        422,
                        {"error": "Cette version de ffbb_data_client n'a pas get_engagement : "
                                  "renseigne l'ID de poule pour cette phase."},
                    )
                engagement = to_plain(get_engagement(int(engagement_id)))
                poule_id = ((engagement or {}).get("idPoule") or {}).get("id")
                if not poule_id:
                    return self._send(404, {"error": "poule introuvable pour cet engagement",
                                            "engagement": engagement})

            # 4) La poule contient les rencontres et le classement
            poule = to_plain(client.get_poule(int(poule_id)))
            return self._send(200, {"engagement": engagement, "poule": poule})
        except Exception as exc:  # on renvoie l'erreur lisible à l'app
            return self._send(502, {"error": f"{type(exc).__name__}: {exc}",
                                    "trace": traceback.format_exc()[-600:]})
