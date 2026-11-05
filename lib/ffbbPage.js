// Synchro FFBB « par la page » : on lit le code source de la page publique d'une
// poule sur competitions.ffbb.com (la même que celle qu'on ouvre dans le
// navigateur). Cette page (Next.js) embarque en JSON TOUTES les rencontres de la
// poule (équipes, horaires, scores, salle, logos) et le classement : pas besoin
// de l'API FFBB (bloquée par le pare-feu BunnyCDN).
//
// Entrée  : le lien de la poule, ex.
//   https://competitions.ffbb.com/ligues/ara/comites/0069/competitions/dfu15?poule=200000003056614&phase=200000002898259
// Sortie  : { pouleId, pouleNom, competitionName, competitionLogoAsset, rencontres, classements }
// où `rencontres` et `classements` reprennent la forme de l'ancienne API
// (nomEquipe1, idEngagementEquipe1.id, idOrganismeEquipe1.logo.id, salle.libelle...)
// pour que le reste de la synchro (actions.js) n'ait pas à changer.

const SITE = "https://competitions.ffbb.com";
const MAX_JOURNEES = 30; // garde-fou : on s'arrête dès qu'une page n'apporte plus rien
const TIME_BUDGET_MS = 8000; // Vercel coupe les actions serveur longues

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

// ---------------------------------------------------------------- lien de la poule
export function parseCompetitionUrl(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(String(raw).trim(), SITE);
  } catch {
    return null;
  }
  if (!/(^|\.)ffbb\.com$/.test(u.hostname)) return null;
  const m = u.pathname.match(/^(.*\/competitions\/[^/]+)/);
  return {
    base: m ? `${u.origin}${m[1]}` : null, // .../competitions/dfu15
    pouleId: u.searchParams.get("poule"),
    phaseId: u.searchParams.get("phase"),
  };
}

// ---------------------------------------------------------------- récupération
async function fetchHtml(url) {
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(9000) });
  } catch (e) {
    const why = e?.name === "TimeoutError" ? "délai dépassé" : e?.message || e;
    throw new Error(`competitions.ffbb.com injoignable (${why}).`);
  }
  if (!res.ok) {
    const blocked = [403, 429, 503].includes(res.status);
    throw new Error(
      `competitions.ffbb.com a répondu HTTP ${res.status}` +
        (blocked ? " (blocage anti-robot du site : les matchs déjà synchronisés sont conservés, réessaie plus tard)." : ".")
    );
  }
  return res.text();
}

// ---------------------------------------------------------------- JSON embarqué
function unescapeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Renvoie tous les blocs JSON exploitables du code source :
//  1) <script type="application/json"> (ex. __NEXT_DATA__)
//  2) self.__next_f.push([1,"..."]) (Next.js « app router »), recollés puis lus ligne par ligne
export function jsonBlobs(html) {
  const blobs = [];

  for (const m of html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    const parsed = tryParse(m[1]) ?? tryParse(unescapeHtml(m[1]));
    if (parsed !== undefined) blobs.push(parsed);
  }

  let flux = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g)) {
    const chunk = tryParse(m[1]);
    if (typeof chunk === "string") flux += chunk;
  }
  for (const line of flux.split("\n")) {
    const m = line.match(/^[0-9a-f]+:(.*)$/);
    if (m) {
      const parsed = tryParse(m[1]);
      if (parsed !== undefined) blobs.push(parsed);
    }
  }
  return blobs;
}

// Parcours récursif ; `chain` = ancêtres (objets) du plus proche au plus lointain.
function walk(node, chain, visit) {
  if (Array.isArray(node)) {
    for (const x of node) walk(x, chain, visit);
    return;
  }
  if (node && typeof node === "object") {
    visit(node, chain);
    const next = [node, ...chain];
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") walk(v, next, visit);
    }
  }
}

// ---------------------------------------------------------------- normalisation
const isLongId = (v) => /^\d{9,}$/.test(String(v ?? ""));

const assetId = (x) => (typeof x === "string" ? x : x && typeof x === "object" ? x.id ?? null : null);

function toScore(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "2026-09-20T14:00:00" -> même chose étiquetée UTC : l'appli enregistre l'heure
// de Paris telle quelle (16:30 reste 16:30), cf. convention du reste du code.
function toIsoDate(v) {
  if (typeof v !== "string" || !v) return null;
  return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`;
}

function normEngagement(eng) {
  const e = eng && typeof eng === "object" ? eng : {};
  const orgLogo = assetId(e.idOrganisme?.logo) || assetId(e.logo);
  return {
    engagement: { id: e.id != null ? String(e.id) : null, nom: e.nom ?? null },
    organisme: {
      id: e.idOrganisme?.id != null ? String(e.idOrganisme.id) : null,
      logo: orgLogo ? { id: orgLogo } : null,
    },
  };
}

function normRencontre(r) {
  const e1 = normEngagement(r.idEngagementEquipe1);
  const e2 = normEngagement(r.idEngagementEquipe2);
  const carto = r.salle?.cartographie ?? {};
  const ville = carto.ville || r.salle?.commune?.libelle || null;
  const rue = carto.adresse || null;
  const cpVille = [carto.codePostal, ville].filter(Boolean).join(" ");
  const joue = r.joue === true || r.joue === "true" || r.joue === 1;
  return {
    id: String(r.id),
    numeroJournee: r.numeroJournee ?? null,
    date_rencontre: toIsoDate(r.date_rencontre),
    joue,
    resultatEquipe1: joue ? toScore(r.resultatEquipe1) : null,
    resultatEquipe2: joue ? toScore(r.resultatEquipe2) : null,
    nomEquipe1: r.nomEquipe1 || null,
    nomEquipe2: r.nomEquipe2 || null,
    idEngagementEquipe1: e1.engagement,
    idEngagementEquipe2: e2.engagement,
    idOrganismeEquipe1: e1.organisme,
    idOrganismeEquipe2: e2.organisme,
    salle: r.salle
      ? {
          libelle: r.salle.libelle ?? carto.title ?? null,
          commune: ville ? { libelle: ville } : null,
          adresse: [rue, cpVille].filter(Boolean).join(", ") || null,
        }
      : null,
  };
}

function normClassement(c) {
  const rawEng = c.idEngagement ?? c.engagement;
  const eng = rawEng && typeof rawEng === "object" ? rawEng : { id: rawEng };
  return {
    idEngagement: { id: eng.id != null ? String(eng.id) : null, nom: eng.nom ?? c.nomEquipe ?? c.nom ?? null },
    position: c.position ?? c.rang ?? c.classement ?? null,
    points: c.points ?? c.pts ?? null,
    matchJoues: c.matchJoues ?? c.matchsJoues ?? c.nbMatchsJoues ?? null,
    gagnes: c.gagnes ?? c.nbGagnes ?? c.victoires ?? null,
    perdus: c.perdus ?? c.nbPerdus ?? c.defaites ?? null,
  };
}

// ---------------------------------------------------------------- extraction d'une page
// Pure (sans réseau) : testable à partir d'un simple fichier HTML enregistré.
export function extractPoule(html, pouleId) {
  const pid = String(pouleId);
  const rencontres = new Map();
  let pouleNode = null; // la fiche de la poule contenant rencontres + classements
  let pouleChain = [];
  let pouleNom = null;

  for (const blob of jsonBlobs(html)) {
    walk(blob, [], (node, chain) => {
      // La fiche de la poule : id = poule, avec ses listes de rencontres / classements.
      if (String(node.id) === pid && (Array.isArray(node.rencontres) || Array.isArray(node.classements))) {
        const size = (node.rencontres?.length ?? 0) + (node.classements?.length ?? 0);
        const best = (pouleNode?.rencontres?.length ?? 0) + (pouleNode?.classements?.length ?? 0);
        if (!pouleNode || size > best) {
          pouleNode = node;
          pouleChain = chain;
        }
      }
      // Une rencontre.
      if (typeof node.nomEquipe1 === "string" && typeof node.nomEquipe2 === "string" && isLongId(node.id)) {
        const own = node.idPoule?.id;
        let belongs;
        if (own != null) belongs = String(own) === pid;
        else belongs = chain.some((a) => String(a.id) === pid && Array.isArray(a.rencontres));
        if (belongs) {
          if (own != null && node.idPoule?.nom && !pouleNom) pouleNom = node.idPoule.nom;
          if (!rencontres.has(String(node.id))) rencontres.set(String(node.id), node);
        }
      }
    });
  }

  // Nom + logo de la compétition (phase) : ancêtres de la fiche de la poule.
  let competitionName = null;
  let competitionLogoAsset = null;
  for (const a of pouleChain) {
    if (!competitionName && Array.isArray(a.poules) && a.nom) competitionName = a.nom;
    if (!competitionLogoAsset) competitionLogoAsset = assetId(a.logo);
  }

  return {
    pouleNom: pouleNode?.nom || pouleNom || null,
    competitionName,
    competitionLogoAsset,
    rencontres: [...rencontres.values()].map(normRencontre),
    classements: (pouleNode?.classements ?? []).map(normClassement),
  };
}

// ---------------------------------------------------------------- point d'entrée
export async function fetchPouleFromPage({ competitionUrl, storedPouleId }) {
  const parsed = parseCompetitionUrl(competitionUrl);
  const pouleId = parsed?.pouleId || storedPouleId || null;

  if (!parsed?.base || !pouleId) {
    throw new Error(
      "Colle dans « Lien competitions.ffbb.com » le lien de la POULE (celui qui contient ?poule=…&phase=…, " +
        "visible dans la barre d'adresse quand tu affiches le calendrier de la poule sur competitions.ffbb.com)."
    );
  }

  const started = Date.now();
  const all = new Map();
  let meta = null;

  for (let n = 1; n <= MAX_JOURNEES; n += 1) {
    const url = new URL(parsed.base);
    url.searchParams.set("poule", pouleId);
    if (parsed.phaseId) url.searchParams.set("phase", parsed.phaseId);
    url.searchParams.set("journee", String(n));

    const html = await fetchHtml(url);
    const page = extractPoule(html, pouleId);
    if (!meta) meta = page;

    let added = 0;
    for (const r of page.rencontres) {
      if (!all.has(r.id)) {
        all.set(r.id, r);
        added += 1;
      }
    }
    if (page.classements.length > (meta.classements?.length ?? 0)) meta.classements = page.classements;

    if (n === 1 && added === 0) {
      throw new Error(
        `Aucun match trouvé pour la poule ${pouleId} dans la page FFBB (lien incorrect, poule vide, ou page protégée par un contrôle anti-robot).`
      );
    }
    // La page d'une journée contient normalement toute la poule : dès qu'une
    // page n'apporte plus rien (ou que le temps presse), on s'arrête.
    if (n > 1 && added === 0) break;
    if (Date.now() - started > TIME_BUDGET_MS) break;
  }

  const rencontres = [...all.values()].sort(
    (a, b) =>
      (Number(a.numeroJournee) || 0) - (Number(b.numeroJournee) || 0) ||
      String(a.date_rencontre ?? "").localeCompare(String(b.date_rencontre ?? ""))
  );

  return {
    pouleId: String(pouleId),
    pouleNom: meta.pouleNom,
    competitionName: meta.competitionName,
    competitionLogoAsset: meta.competitionLogoAsset,
    rencontres,
    classements: meta.classements ?? [],
  };
}

// Variante SANS réseau : les pages HTML ont déjà été téléchargées (par le script
// Python push_ffbb.py, qui dépose les pages brutes dans ffbb_poule_cache sous la
// forme { pages: [html, ...] }). On les analyse ici, côté serveur de l'appli.
// Renvoie la même forme que fetchPouleFromPage.
export function pouleFromPages(pages, pouleId) {
  const all = new Map();
  let meta = null;
  for (const html of pages ?? []) {
    if (typeof html !== "string" || !html) continue;
    const page = extractPoule(html, pouleId);
    if (!meta) meta = page;
    for (const r of page.rencontres) if (!all.has(r.id)) all.set(r.id, r);
    if (page.classements.length > (meta.classements?.length ?? 0)) meta.classements = page.classements;
    if (!meta.pouleNom && page.pouleNom) meta.pouleNom = page.pouleNom;
    if (!meta.competitionName && page.competitionName) meta.competitionName = page.competitionName;
    if (!meta.competitionLogoAsset && page.competitionLogoAsset) meta.competitionLogoAsset = page.competitionLogoAsset;
  }
  const rencontres = [...all.values()].sort(
    (a, b) =>
      (Number(a.numeroJournee) || 0) - (Number(b.numeroJournee) || 0) ||
      String(a.date_rencontre ?? "").localeCompare(String(b.date_rencontre ?? ""))
  );
  return {
    pouleId: String(pouleId),
    pouleNom: meta?.pouleNom ?? null,
    competitionName: meta?.competitionName ?? null,
    competitionLogoAsset: meta?.competitionLogoAsset ?? null,
    rencontres,
    classements: meta?.classements ?? [],
  };
}
