// Règles du club et reconnaissance des équipes dans une poule FFBB (fonctions pures, sans base de données).
// Repris de l'appli TeamStats (lib/clubTeams.ts), adapté à la forme des rencontres de lib/ffbbPage.js
// (idEngagementEquipe1.id, nomEquipe1...).

// Nom du club tel qu'écrit par la FFBB : « OLYMPIC SATHONAY », « OLYMPIC SATHONAY - 2 »...
export const CLUB_FFBB_NAME = "OLYMPIC SATHONAY";
export const CLUB_COMITE_PATH = "ligues/ara/comites/0069";

export const normName = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

// « OLYMPIC SATHONAY - 2 » -> { base: "OLYMPIC SATHONAY", numero: 2 }
export function splitTeamName(name) {
  const m = /^(.*?)\s*-\s*(\d+)\s*$/.exec(String(name || "").trim());
  return m ? { base: normName(m[1]), numero: parseInt(m[2], 10) } : { base: normName(name), numero: null };
}
export const isClubTeamName = (name) => splitTeamName(name).base === normName(CLUB_FFBB_NAME);

// Saison sportive (septembre -> août) d'une date FFBB (« 2026-09-20T14:00:00 ») : « 2026-2027 ».
export function seasonOfIso(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || "");
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const end = parseInt(m[2], 10) >= 9 ? y + 1 : y;
  return `${end - 1}-${end}`;
}

// Saison d'une poule = saison de la majorité de ses matchs datés.
export function seasonOfPoule(poule) {
  const count = new Map();
  for (const r of poule.rencontres) {
    const s = seasonOfIso(r.date_rencontre);
    if (s) count.set(s, (count.get(s) || 0) + 1);
  }
  let best = null;
  let n = 0;
  for (const [s, c] of count) {
    if (c > n) {
      n = c;
      best = s;
    }
  }
  return best;
}

// Catégorie + sexe + numéro d'équipe, lus dans le nom de la compétition et le nom de l'équipe.
// code : « U15F », « U15F-2 », « SENF »
export function identifyTeam(competitionName, teamName) {
  const comp = normName(competitionName);
  const um = /\bU\s?(\d{1,2})\b/.exec(comp);
  const category = um
    ? `U${parseInt(um[1], 10)}`
    : /SENIOR|SEN\b|REGIONALE|PRE.?REGIONALE|LOISIR/.test(comp)
      ? "Seniors"
      : "Autre";
  const sexe = /FEMININ|FILLE|\bF\b/.test(comp) ? "F" : /MASCULIN|GARCON|\bM\b/.test(comp) ? "M" : "X";
  const { numero } = splitTeamName(teamName);
  const catCode = category === "Seniors" ? "SEN" : category === "Autre" ? "AUT" : category;
  const sx = sexe === "X" ? "" : sexe;
  const n = numero && numero > 1 ? numero : null; // « OLYMPIC SATHONAY » et « … - 1 » = équipe 1
  return {
    code: `${catCode}${sx}${n ? `-${n}` : ""}`,
    label: `${category}${sx ? ` ${sx}` : ""}${n ? ` · équipe ${n}` : ""}`,
    category,
    sexe,
    numero: n,
  };
}

// « Saison régulière » = phase 1, « … Phase 2 » = 2 ; sinon 1.
export function phaseNumberOf(name) {
  if (/saison r[ée]guli[eè]re/i.test(name || "")) return 1;
  const m = /phase\s*(\d+)/i.exec(name || "");
  return m ? parseInt(m[1], 10) : 1;
}
export const isCup = (name) => /coupe|tour\b|challenge|trophee/i.test(name || "");

// Lien public de la poule (celui qu'on collait à la main dans « Gérer les phases »).
export const competitionUrl = (code, pouleId, competitionId, prefix = null) =>
  `https://competitions.ffbb.com${prefix || `/${CLUB_COMITE_PATH}`}/competitions/${code || competitionId || "x"}` +
  `?poule=${pouleId ?? ""}${competitionId ? `&phase=${competitionId}` : ""}`;

// Nos équipes (engagements) présentes dans une poule.
export function clubEngagementsIn(poule) {
  const out = new Map();
  for (const r of poule.rencontres) {
    const e1 = r.idEngagementEquipe1?.id;
    const e2 = r.idEngagementEquipe2?.id;
    if (e1 && isClubTeamName(r.nomEquipe1)) out.set(String(e1), { engagementId: String(e1), teamName: r.nomEquipe1 || "" });
    if (e2 && isClubTeamName(r.nomEquipe2)) out.set(String(e2), { engagementId: String(e2), teamName: r.nomEquipe2 || "" });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------------------
// Équipes concernées par une participante
// ---------------------------------------------------------------------------------------

// « U15F », « u15 f », « U15F-2 », « SENF » -> { category, sexe, numero } ; null si illisible.
// Le sexe est obligatoire : sans lui, « U15 » attraperait aussi les garçons.
export function parseTeamCode(raw) {
  const t = normName(raw).replace(/\s+/g, "").replace(/·|EQUIPE/g, "-").replace(/-+/g, "-");
  const m = /^(U\d{1,2}|SEN|SENIORS?)([FM])(?:-(\d+))?$/.exec(t);
  if (!m) return null;
  const category = m[1].startsWith("U") ? `U${parseInt(m[1].slice(1), 10)}` : "Seniors";
  const numero = m[3] ? parseInt(m[3], 10) : null;
  return { category, sexe: m[2], numero: numero && numero > 1 ? numero : null };
}

// « U15F, SENF-2 » -> liste de cibles lisibles.
export function parseTeamCodes(text) {
  return String(text || "")
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => ({ raw: x, parsed: parseTeamCode(x) }));
}

// La cible (catégorie, sexe, numéro) correspond-elle à l'équipe identifiée dans la poule ?
// Un sexe « X » (compétition mixte / non lisible dans le nom) est accepté.
export function teamMatchesTarget(target, ident) {
  return (
    target.category === ident.category &&
    (ident.sexe === "X" || target.sexe === ident.sexe) &&
    (target.numero ?? null) === (ident.numero ?? null)
  );
}

// Détermine les équipes à suivre pour une participante, par ordre de priorité :
//  1) le champ « Équipes FFBB suivies » de Paramètres (ex. « U15F » ou « U15F, SENF-2 ») ;
//  2) à défaut, les équipes déjà reconnues dans les phases FFBB de la saison en cours.
// Le champ « Catégorie » de Paramètres n'est volontairement PAS utilisé : il évolue d'une saison à l'autre.
// Renvoie { targets, source } ou { error }.
export function resolveTargets(participantSport, currentSeasonPhases) {
  const configured = parseTeamCodes(participantSport?.ffbb_team_codes);
  if (configured.length > 0) {
    const bad = configured.filter((c) => !c.parsed).map((c) => c.raw);
    if (bad.length > 0) {
      return { error: `Équipes FFBB illisibles dans Paramètres : ${bad.join(", ")} (format attendu : U15F, U13M-2, SENF).` };
    }
    return { targets: configured.map((c) => c.parsed), source: "Paramètres" };
  }

  const inferred = new Map();
  for (const ph of currentSeasonPhases ?? []) {
    if (!ph.competition_name || !ph.our_team_name) continue;
    const id = identifyTeam(ph.competition_name, ph.our_team_name);
    if (id.category === "Autre" || id.sexe === "X") continue;
    inferred.set(id.code, { category: id.category, sexe: id.sexe, numero: id.numero });
  }
  if (inferred.size > 0) return { targets: [...inferred.values()], source: "phases de la saison" };

  return { error: "équipe inconnue — renseigne « Équipes FFBB suivies » (ex. U15F) dans Paramètres" };
}

export const targetLabel = (t) =>
  `${t.category} ${t.sexe}${t.numero ? ` · équipe ${t.numero}` : ""}`;
