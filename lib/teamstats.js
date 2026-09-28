// Outils de rapprochement entre les noms saisis dans TeamStats et les fiches
// joueuses de Multisports. Fonctions pures (aucun accès base) — utilisables
// côté serveur comme côté client.
//
// Convention TeamStats : le nom affiché est le prénom, suivi (uniquement si
// nécessaire pour distinguer deux joueuses) des premières lettres du nom de
// famille puis d'un point. Ex. "LAURA B." / "LAURA S." ou "LAURA BA." /
// "LAURA BE." ; une joueuse sans homonyme n'a que son prénom ("CHLOE").

export function normalizeKey(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// "LAURA BA." -> { first: "LAURA", prefix: "BA" } ; "CHLOE" -> { first: "CHLOE", prefix: "" }
export function parseTeamStatsName(raw) {
  const text = String(raw || "").trim().replace(/\s+/g, " ");
  if (!text.endsWith(".")) return { first: text, prefix: "", display: text };
  const tokens = text.split(" ");
  const last = tokens.pop().replace(/\.$/, "");
  if (tokens.length === 0) return { first: last, prefix: "", display: text };
  return { first: tokens.join(" "), prefix: last, display: text };
}

export function titleCase(s) {
  return (s || "")
    .toLowerCase()
    .replace(/(^|[\s-])([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

// Prénom / nom d'une fiche Multisports. Les fiches créées "à la main" avec
// seulement un prénom (ex. « CHLOE ») n'ont ni first_name ni last_name : on
// retombe alors sur `name`.
function playerNameParts(p) {
  if (p.first_name || p.last_name) return { first: p.first_name || "", last: p.last_name || "" };
  return { first: p.name || "", last: "" };
}

export function playerMatchesTeamStatsName(player, parsed) {
  const { first, last } = playerNameParts(player);
  if (normalizeKey(first) !== normalizeKey(parsed.first)) return false;
  if (!parsed.prefix) return true;
  const lastKey = normalizeKey(last);
  return lastKey !== "" && lastKey.startsWith(normalizeKey(parsed.prefix));
}

// Cherche la fiche correspondant à un nom TeamStats.
//  - d'abord dans l'effectif de la phase (rosterIds),
//  - sinon dans le reste de la base (la joueuse est unique en base),
//  - une seule correspondance exigée à chaque étape : deux candidates =
//    "ambigu", on n'invente rien.
// Renvoie { kind: "roster" | "other" | "ambiguous" | "new", player? }.
export function findPlayerForTeamStatsName(name, allPlayers, rosterIds, usedIds) {
  const parsed = parseTeamStatsName(name);
  const candidates = allPlayers.filter((p) => p.role !== "entraineur" && !usedIds.has(p.id));

  const inRoster = candidates.filter((p) => rosterIds.has(p.id) && playerMatchesTeamStatsName(p, parsed));
  if (inRoster.length === 1) return { kind: "roster", player: inRoster[0], parsed };
  if (inRoster.length > 1) return { kind: "ambiguous", parsed };

  const elsewhere = candidates.filter((p) => !rosterIds.has(p.id) && playerMatchesTeamStatsName(p, parsed));
  if (elsewhere.length === 1) return { kind: "other", player: elsewhere[0], parsed };
  if (elsewhere.length > 1) return { kind: "ambiguous", parsed };

  return { kind: "new", parsed };
}

export function secondsToMinutes(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
