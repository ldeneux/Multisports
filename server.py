import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from ffbb_data_client import FFBBDataClient

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = FFBBDataClient.create()

@app.get("/")
def home():
    return {"status": "API FFBB Sathonay en ligne !"}

@app.get("/club/{identifiant}")
def get_club(identifiant: str):
    try:
        club = client.get_organisme(identifiant)
        return {"data": club}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/club/{identifiant}/matchs")
def get_club_matchs(
    identifiant: str, 
    team: str = "", 
    limit: int = 50, 
    offset: int = 0,
    date_from: str = None,
    date_to: str = None
):
    url = f"https://ffbb-api.desimone.fr/api/v1/club/{identifiant}/matches"
    headers = {"Accept": "application/json"}
    params = {
        "team": team,
        "limit": str(limit),
        "offset": str(offset)
    }
    if date_from:
        params["date_from"] = date_from
    if date_to:
        params["date_to"] = date_to

    try:
        response = httpx.get(url, headers=headers, params=params, timeout=10.0)
        if response.status_code == 200:
            return response.json()
        else:
            # Fallback si l'endpoint externe échoue, on renvoie une liste vide propre
            return {"identifiant": identifiant, "matchs": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/poule/{poule_id}/matchs")
def get_poule_matchs(poule_id: str):
    # Conserve votre route de secours pour les poules
    return {"poule_id": poule_id, "matchs": []}