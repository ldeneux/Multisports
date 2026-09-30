// Outils de rapprochement entre les noms saisis dans TeamStats et les fiches
// joueuses de Multisports. Fonctions pures (aucun accès base) — utilisables
// côté serveur comme côté client.
//
// Convention réelle de stats_players.name (et donc de
// stats_player_game_stats.player_name / stats_player_period_stats.player_name) :
// le nom complet en majuscules, prénom puis nom, séparés par un espace —
// ex. "CANDICE DENEUX". Une joueuse sans nom de famille connu n'a que son
// prénom — ex. "MAYRA".

export function normalizeKey(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// "CANDICE DENEUX" -> { first: "CANDICE", last: "DENEUX" }
// "MAYRA" -> { first: "MAYRA", last: null }
export function parseTeamStatsName(raw) {
  const tokens = String(raw || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (tokens.length === 0) return { first: "", last: null };
  if (tokens.length === 1) return { first: tokens[0], last: null };
  const last = tokens.pop();
  return { first: tokens.join(" "), last };
}

// Prénom / nom d'une fiche Multisports. Les fiches créées "à la main" avec
// seulement un prénom n'ont ni first_name ni last_name : on retombe alors
// sur `name`.
function playerNameParts(p) {
  if (p.first_name || p.last_name) return { first: p.first_name || "", last: p.last_name || "" };
  return { first: p.name || "", last: "" };
}

export function playerMatchesTeamStatsName(player, parsed) {
  const { first, last } = playerNameParts(player);
  if (normalizeKey(first) !== normalizeKey(parsed.first)) return false;
  if (!parsed.last) return true; // TeamStats n'a que le prénom : on ne compare pas le nom
  return normalizeKey(last) === normalizeKey(parsed.last);
}

// Cherche la fiche correspondant à un nom TeamStats.
//  - d'abord dans l'effectif de la phase (rosterIds),
//  - sinon dans le reste de la base (la joueuse est unique en base),
//  - une seule correspondance exigée à chaque étape : deux candidates =
//    "ambigu", on n'invente rien.
// Renvoie { kind: "roster" | "other" | "ambiguous" | "new", player?, parsed }.
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

// L'inverse de secondsToMinutes — pour convertir un champ "MM:SS" saisi à la
// main (édition d'une période) vers des secondes avant stockage.
export function minutesToSeconds(mmss) {
  if (!mmss) return 0;
  const match = String(mmss).trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

// Prénom d'affichage compact pour les tableaux de feuille de match (colonne
// "Joueuse" réduite) — toujours le premier mot du prénom connu.
export function displayFirstName(player) {
  const first = player?.first_name || player?.name || "";
  return first.split(" ")[0] || player?.name || "";
}

// Nombre de périodes d'un match selon la catégorie d'âge — U11 se joue en 8
// périodes (P1..P8), toutes les catégories au-dessus (U13, U15...) en 4
// quarts-temps (Q1..Q4). La catégorie se lit dans le libellé de la
// compétition de l'ENGAGEMENT ("Départementale féminine U15 - Division 2"),
// jamais dans la catégorie de la fiche participant (qui n'est qu'indicative
// et peut ne pas correspondre à l'équipe/la phase du match en cours).
export function periodsForCategory(competitionLabel) {
  const match = String(competitionLabel || "").match(/U(\d{1,2})/i);
  const ageCategory = match ? Number(match[1]) : null;
  if (ageCategory != null && ageCategory <= 11) return { count: 8, prefix: "P" };
  return { count: 4, prefix: "Q" };
}
