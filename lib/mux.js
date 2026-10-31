// Petit client pour l'API Mux (https://docs.mux.com). Uniquement côté serveur :
// ne jamais importer ce fichier depuis un composant "use client".
const API = "https://api.mux.com";

export function muxConfigured() {
  return Boolean(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET);
}

export function liveStreamId() {
  return process.env.MUX_LIVE_STREAM_ID || "";
}

export async function muxFetch(path, { method = "GET", body } = {}) {
  const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.messages?.join(" ") || json?.error?.message || `Mux a répondu ${res.status}.`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json?.data ?? null;
}
