// Appelle le pont Python (api/ffbb.py) qui utilise ffbb_data_client.
// Renvoie { poule_id, total_fenetre, rencontres: [...] } : les matchs de la poule
// présents dans la fenêtre de recherche FFBB (environ 2 semaines, sans scores).
export async function fetchFfbbPoule({ engagementId, pouleId, saison }) {
  const base =
    process.env.FFBB_PROXY_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");

  const url = new URL("/api/ffbb", base);
  if (engagementId) url.searchParams.set("engagement_id", String(engagementId));
  if (pouleId) url.searchParams.set("poule_id", String(pouleId));
  if (saison) url.searchParams.set("saison", String(saison));

  const res = await fetch(url, {
    headers: { "x-ffbb-secret": process.env.FFBB_PROXY_SECRET ?? "" },
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error || JSON.stringify(body);
    } catch {
      detail = (await res.text()).slice(0, 200);
    }
    throw new Error(`Pont FFBB (HTTP ${res.status}) : ${detail}`);
  }
  return res.json();
}
