// Génération minimale mais correcte d'un flux iCalendar (RFC 5545) — juste
// ce qu'il faut pour un flux en lecture seule que Google/Apple/Outlook
// Calendar savent tous consommer via "S'abonner depuis une URL".

function escapeIcsText(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// "2026-10-17" -> "20261017" (date seule, pour un événement "journée
// entière").
function dateOnlyToIcs(dateStr) {
  return dateStr.replaceAll("-", "");
}

// "2026-10-17" + N jours -> "20261020" (DTEND est EXCLUSIF pour un
// événement journée entière selon la RFC : pour couvrir 3 jours pleins à
// partir du 17, DTEND doit être le 20).
function dateOnlyPlusDaysToIcs(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnlyToIcs(d.toISOString().slice(0, 10));
}

// Date JS -> "20261017T173000Z" (toujours en UTC — chaque agenda se charge
// de la conversion vers le fuseau de son utilisateur, ça évite tout souci
// de TZID).
function dateTimeToIcsUtc(date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Construit un événement ICS.
 * - `allDay: true` -> DTSTART/DTEND en VALUE=DATE (journée entière, sur
 *   `nbDays` jours).
 * - `allDay: false` -> DTSTART/DTEND en UTC (horodatage précis), avec une
 *   durée par défaut de `durationMinutes` si non précisé autrement.
 */
export function buildIcsEvent({ uid, summary, location, description, allDay, date, time, nbDays = 1, durationMinutes = 90 }) {
  const lines = ["BEGIN:VEVENT", `UID:${uid}`, `SUMMARY:${escapeIcsText(summary)}`];

  if (allDay || !time) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnlyToIcs(date)}`);
    lines.push(`DTEND;VALUE=DATE:${dateOnlyPlusDaysToIcs(date, Math.max(nbDays, 1))}`);
  } else {
    const [h, m] = time.split(":").map(Number);
    // Les heures sont saisies/synchronisées en heure de Paris ; on les
    // convertit en UTC de façon simple (été/hiver) plutôt que de gérer un
    // vrai TZID, largement suffisant pour un agenda familial.
    const isDst = isFrenchSummerTime(date);
    const start = new Date(`${date}T00:00:00Z`);
    start.setUTCHours(h - (isDst ? 2 : 1), m || 0, 0, 0);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    lines.push(`DTSTART:${dateTimeToIcsUtc(start)}`);
    lines.push(`DTEND:${dateTimeToIcsUtc(end)}`);
  }

  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

// Approximation simple de l'heure d'été en France (dernier dimanche de
// mars à fin octobre) — suffisant pour un agenda familial, pas besoin
// d'une vraie base de données de fuseaux horaires ici.
function isFrenchSummerTime(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const month = d.getUTCMonth() + 1;
  if (month > 3 && month < 10) return true;
  if (month < 3 || month > 10) return false;
  // Mars ou octobre : approximation au dernier dimanche du mois.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), month, 0));
  const lastSunday = lastDay.getUTCDate() - lastDay.getUTCDay();
  return month === 3 ? d.getUTCDate() >= lastSunday : d.getUTCDate() < lastSunday;
}

export function buildIcsCalendar(events) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sport Famille//Calendrier//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Sport Famille",
    "X-WR-TIMEZONE:Europe/Paris",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
