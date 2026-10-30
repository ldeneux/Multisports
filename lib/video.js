// Utilitaires pour la page Direct & replays.

// Identifiant YouTube à partir d'un lien (watch, youtu.be, live, shorts, embed) ou d'un identifiant seul.
export function parseYouTubeId(input) {
  const raw = (input ?? "").toString().trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(live|embed|shorts|v)\/([\w-]{6,})/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return /^[\w-]{11}$/.test(raw) ? raw : null;
  }
}

export function youtubeThumb(id) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

// "1:02:03", "12:30", "95" ou "1h02m03s" → secondes (null si vide ou illisible)
export function parseTime(input) {
  const raw = (input ?? "").toString().trim().toLowerCase();
  if (!raw) return null;
  const hms = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:[.,]\d+)?)s?)?$/);
  if (hms && /[hms]/.test(raw)) {
    const [, h, m, s] = hms;
    return Number(h || 0) * 3600 + Number(m || 0) * 60 + Number((s || "0").replace(",", "."));
  }
  if (!/^\d+(?::\d{1,2}){0,2}(?:[.,]\d+)?$/.test(raw)) return null;
  const parts = raw.replace(",", ".").split(":").map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

// secondes → "1:02:03" ou "12:30"
export function formatTime(sec) {
  if (sec === null || sec === undefined || Number.isNaN(Number(sec))) return "";
  const s = Math.max(0, Math.floor(Number(sec)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
}
