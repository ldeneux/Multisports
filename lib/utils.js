// Formatte une date ISO (YYYY-MM-DD) en format lisible français.
export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("fr-FR", {
    weekday: opts.weekday === false ? undefined : opts.weekday ?? "short",
    day: "numeric",
    month: "long",
    year: opts.year === false ? undefined : "numeric",
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Convertit un temps de natation "1:02.45" en millisecondes, pour trier/comparer.
export function swimTimeToMs(input) {
  if (!input) return null;
  const match = String(input).trim().match(/^(?:(\d+):)?(\d{1,2})[.,](\d{1,2})$/);
  if (!match) return null;
  const [, min, sec, hundredths] = match;
  const minutes = min ? parseInt(min, 10) : 0;
  const seconds = parseInt(sec, 10);
  const centis = parseInt(hundredths.padEnd(2, "0"), 10);
  return minutes * 60000 + seconds * 1000 + centis * 10;
}

// Convertit des millisecondes en "1:02.45" pour l'affichage.
export function msToSwimTime(ms) {
  if (ms === null || ms === undefined) return "—";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.round((ms % 1000) / 10);
  const secStr = String(seconds).padStart(minutes > 0 ? 2 : 1, "0");
  const centiStr = String(centis).padStart(2, "0");
  return minutes > 0 ? `${minutes}:${secStr}.${centiStr}` : `${secStr}.${centiStr}`;
}

export function calculateAge(birthdateStr) {
  if (!birthdateStr) return null;
  const birth = new Date(birthdateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Transforme "Course à pied" en "course-a-pied".
export function slugify(text) {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const MAIN_SPORT_SLUGS = [
  "basket",
  "natation",
  "course-a-pied",
  "triathlon",
  "plongee",
];

// La saison FFN "2025/2026" est identifiée par son année de FIN (2026).
// Sept-Déc -> saison en cours se termine l'année suivante. Jan-Août -> se
// termine cette année-là.
export function computeCurrentSeasonYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}
