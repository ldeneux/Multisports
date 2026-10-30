// Appelle le pont Python (api/ffbb.py) qui utilise ffbb_data_client.
// Renvoie { engagement, poule } — "engagement" peut être null si on connaissait
// déjà l'ID de la poule (pas besoin de relire l'engagement dans ce cas).
export async function fetchFfbbPoule({ engagementId, pouleId }) {
  const base =
    process.env.FFBB_PROXY_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");

  const url = new URL("/api/ffbb", base);
  if (engagementId) url.searchParams.set("engagement_id", String(engagementId));
  if (pouleId) url.searchParams.set("poule_id", String(pouleId));

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
