import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { formatDate, ffbbAssetUrl, ffnCompetitionResultsUrl, ffnLiveUrl, ffnCompetitionIdFromLink } from "@/lib/utils";
import CalendarEvent from "@/components/CalendarEvent";
import { findHostClub } from "@/lib/ffn-clubs-rhone";

export const dynamic = "force-dynamic";

// Palette cyclique par participant (bleu/vert/orange en priorité, comme
// demandé) — pas de colonne "couleur" en base, donc attribuée par ordre
// (le même ordre que le tri par date de naissance partout ailleurs dans
// l'app, pour rester stable d'une page à l'autre).
const PARTICIPANT_COLORS = ["#1E88C7", "#2E9E6B", "#E08E1D", "#8E44AD", "#C2185B", "#00838F"];

const SPORT_ICONS = {
  basket: "🏀",
  natation: "🏊",
  "course-a-pied": "🏃‍♀️",
  triathlon: "🚴",
  plongee: "🤿",
  Parapente: "🪁",
};
function iconFor(slug) {
  return SPORT_ICONS[slug] ?? "📅";
}

const MONTH_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function homeHref({ month, year, participant }) {
  const params = new URLSearchParams();
  params.set("month", String(month));
  params.set("year", String(year));
  if (participant) params.set("participant", participant);
  return `/?${params.toString()}`;
}

// "SALLE DE SPORT, VILLE" -> "VILLE - SALLE DE SPORT". Uniquement pour
// l'affichage (jamais écrit en base) : le lieu est saisi/synchronisé au
// format "salle, ville", mais on veut la ville en avant dans le calendrier.
function invertLocation(location) {
  if (!location) return "";
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return location.toUpperCase();
  return [...parts].reverse().join(" - ").toUpperCase();
}

function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Pour un événement sur plusieurs jours (nb_days > 1) : un bandeau de
// couleur uni, sans texte, sur chacun des jours suivants — juste pour
// signaler visuellement que ça continue, sans dupliquer l'information.
function buildContinuationEntries(baseEvent, nbDays, rangeStartStr, rangeEndStr) {
  const extra = [];
  for (let i = 1; i < (nbDays || 1); i++) {
    const date = addDaysStr(baseEvent.date, i);
    if (date < rangeStartStr || date >= rangeEndStr) continue;
    extra.push({
      ...baseEvent,
      key: `${baseEvent.key}-cont-${i}`,
      date,
      continuation: true,
    });
  }
  return extra;
}


// ---- Fiches détaillées (double-clic sur un événement) ----------------------
const stripTeamSuffix = (name) => (name || "").trim().replace(/\s*-\s*\d+\s*$/, "");
const normalizeLoose = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function mapsLink(query) {
  const q = String(query ?? "").trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// "2026-10-31" -> "Samedi 31/10/2026" (+ " au 01/11/2026" si plusieurs jours)
function swimDateText(dateStr, nbDays, time) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00Z`);
  const weekday = capitalize(d.toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" }));
  const short = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  let text = `${weekday} ${short}`;
  if (nbDays && nbDays > 1) {
    const end = new Date(`${addDaysStr(dateStr, nbDays - 1)}T00:00:00Z`);
    text += ` au ${end.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}`;
  }
  return time ? `${text} · ${time}` : text;
}

function journeeLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return value ? String(value) : "";
  return n === 1 ? "1ère journée" : `${n}e journée`;
}

function swimDetail({ title, city, poolLength, dateStr, nbDays, time, level, comment, ffnLink, liveLink }) {
  const club = findHostClub({ title, location: city });
  const addressLines = club?.address ? [club.address] : [];
  return {
    kind: "swim",
    title,
    city: city ? city.toUpperCase() : "",
    poolLength: poolLength || null,
    dateText: swimDateText(dateStr, nbDays, time),
    level: level || "",
    comment: comment || "",
    ffnLink: ffnLink || "",
    liveLink: liveLink || "",
    clubName: club?.name ?? null,
    clubLogo: club?.logo ?? null,
    addressLines,
    addressNote: club?.address ? "Adresse du club organisateur (annuaire du comité Rhône) : à vérifier avant de partir." : null,
    mapsUrl: mapsLink(club?.address || [title, city].filter(Boolean).join(" ")),
  };
}

export default async function HomePage({ searchParams }) {
  const supabase = createClient();

  const { data: participants } = await supabase.from("participants").select("*").order("birthdate");
  const colorByParticipant = new Map(
    (participants ?? []).map((p, i) => [p.id, PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length]])
  );

  const now = new Date();
  const year = parseInt(searchParams?.year, 10) || now.getFullYear();
  const month = parseInt(searchParams?.month, 10) || now.getMonth() + 1; // 1-12
  const selectedParticipantId = searchParams?.participant || null;

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const startDateStr = startIso.slice(0, 10);
  const endDateStr = endIso.slice(0, 10);
  // Fenêtre élargie en amont pour récupérer les événements multi-jours
  // commencés le mois précédent mais qui débordent sur le mois affiché
  // (ex. une compétition de 3 jours démarrée le 31) — 13 jours de marge
  // couvre largement tout événement raisonnable.
  const lookbackDateStr = addDaysStr(startDateStr, -13);

  // ---- Basket : matchs du mois, toujours "les nôtres" (pas de notion de
  // "suivi" côté basket comme pour la natation). ----------------------------
  const { data: bbMatches } = await supabase
    .from("basketball_matches")
    .select("*, participant_sports(participant_id, category, participants(first_name))")
    .gte("match_date", startIso)
    .lt("match_date", endIso)
    // Depuis qu'on synchronise TOUTE la poule (pas que nos matchs, pour
    // permettre la vue "Toute la poule" côté Basket), cette table contient
    // aussi les matchs des autres équipes, rattachés au même
    // participant_sport_id que celui qui a fait la synchro. us_is_team1
    // n'est renseigné (true/false) QUE pour les matchs qui nous concernent
    // vraiment — sans ce filtre, le calendrier affichait n'importe quel
    // match de la poule comme si c'était le nôtre.
    .not("us_is_team1", "is", null)
    .order("match_date");

  // Adresses / gymnases des clubs qui reçoivent (équipe 1 = domicile), pour la fiche détaillée.
  const homeClubKeys = [
    ...new Set(
      (bbMatches ?? [])
        .flatMap((m) => [stripTeamSuffix(m.team1_name), stripTeamSuffix(m.team2_name)])
        .filter(Boolean)
    ),
  ];
  const { data: clubRows } = homeClubKeys.length
    ? await supabase.from("basketball_clubs").select("club_key, gymnase, adresse, logo_asset").in("club_key", homeClubKeys)
    : { data: [] };
  const clubByKey = new Map((clubRows ?? []).map((c) => [c.club_key, c]));

  const basketEvents = (bbMatches ?? [])
    .filter((m) => m.match_date)
    .map((m) => {
      const participantId = m.participant_sports?.participant_id;
      const d = new Date(m.match_date);
      // L'adversaire, pas l'équipe qui reçoit — à domicile, l'équipe qui
      // reçoit est presque toujours la nôtre, ce serait redondant/inutile
      // de l'afficher (ex. systématiquement "OLYMPIC SATHONAY").
      const opponentName = m.us_is_team1 ? m.team2_name : m.team1_name;
      // Pas d'adversaire = on est EXEMPTE ce week-end (poule impaire) : on l'écrit en
      // clair, avec la catégorie de la joueuse, sans sous-titre ni fiche détaillée.
      const isExempt = !opponentName;
      const category = m.participant_sports?.category;
      return {
        key: `bb-${m.id}`,
        date: m.match_date.slice(0, 10),
        time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        sportSlug: "basket",
        participantId,
        title: isExempt
          ? `Pas de match ce week-end${category ? ` en ${category}` : ""}`
          : opponentName,
        subtitle: isExempt
          ? ""
          : `${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} : ${invertLocation(
              m.location || ""
            )}`,
        detail: isExempt ? null : (() => {
          // m.match_date = heure de Paris lue comme UTC : on l'affiche donc en UTC.
          const club = clubByKey.get(stripTeamSuffix(m.team1_name));
          const club2 = clubByKey.get(stripTeamSuffix(m.team2_name));
          const gym = club?.gymnase || (m.location ? m.location.split(",")[0].trim() : "");
          const addr = club?.adresse || "";
          // "Gymnase X, Ville" déjà contenu dans l'adresse : on ne l'affiche qu'une fois.
          const addressLines = [];
          if (gym && !(addr && normalizeLoose(addr).startsWith(normalizeLoose(gym)))) addressLines.push(gym);
          if (addr) addressLines.push(addr);
          if (addressLines.length === 0 && m.location) addressLines.push(m.location);
          const hhmm = m.match_date.slice(11, 16);
          const dayText = d.toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          });
          const played = m.status === "joue" && m.team1_score != null && m.team2_score != null;
          return {
            kind: "basket",
            competition: [m.division_label, journeeLabel(m.numero_journee)].filter(Boolean).join(" - "),
            team1: m.team1_name,
            team2: m.team2_name,
            // Écusson du match, sinon celui enregistré pour le club (table des clubs).
            logo1: ffbbAssetUrl(m.team1_logo_asset || club?.logo_asset, { width: 300 }),
            logo2: ffbbAssetUrl(m.team2_logo_asset || club2?.logo_asset, { width: 300 }),
            usIsTeam1: m.us_is_team1,
            category: m.participant_sports?.category ?? "",
            played,
            score1: played ? m.team1_score : null,
            score2: played ? m.team2_score : null,
            dateText: hhmm === "00:00" ? `${dayText} (heure à confirmer)` : `${dayText} à ${hhmm}`,
            addressLines,
            addressNote:
              addr && !normalizeLoose(addr).startsWith(normalizeLoose(gym || "§"))
                ? "Adresse enregistrée pour le club : la salle peut être ailleurs, vérifie avec l'itinéraire."
                : null,
            mapsUrl: mapsLink([gym, addr].filter(Boolean).join(", ") || m.location),
          };
        })(),
      };
    });

  // Compétitions natation à venir saisies à la main (le calendrier
  // prévisionnel de la page Natation) — seule source pour les événements
  // natation réellement à venir, y compris sur plusieurs jours.
  const { data: plannedRows } = await supabase
    .from("swim_planned_competitions")
    .select("*, participant_sports(participant_id, participants(first_name))")
    .gte("start_date", lookbackDateStr)
    .lt("start_date", endDateStr);

  // ---- Natation : compétitions du mois où une de nos filles (pas les
  // nageuses "suivies" d'autres clubs) a un résultat enregistré. Limite
  // connue : la synchro FFN récupère les compétitions via leurs RÉSULTATS,
  // donc une compétition future sans résultat publié n'apparaît pas encore
  // ici — c'est le calendrier prévisionnel (ci-dessous) qui comble ce trou.
  const { data: competitions } = await supabase
    .from("swim_competitions")
    .select("*")
    .gte("competition_date", startDateStr)
    .lt("competition_date", endDateStr);

  // Jours déjà couverts par une ligne du calendrier prévisionnel (par
  // participant) : la ligne saisie à la main est plus riche (heure, lien,
  // commentaire), on n'ajoute donc pas en double la compétition FFN du même jour.
  const plannedCover = new Set();
  (plannedRows ?? []).forEach((row) => {
    const pid = row.participant_sports?.participant_id;
    for (let i = 0; i < (row.nb_days || 1); i++) plannedCover.add(`${pid}|${addDaysStr(row.start_date, i)}`);
  });

  let swimEvents = [];
  if (competitions && competitions.length > 0) {
    const compIds = competitions.map((c) => c.id);
    // On part de NOS nageuses (liées à un participant) plutôt que de lire tous
    // les résultats de la compétition : une compétition compte des milliers de
    // lignes et Supabase en renvoie 1000 au maximum, ce qui faisait manquer
    // certaines de nos compétitions. On inclut aussi les relais (sans course
    // individuelle, la nageuse n'a aucune ligne dans swim_results).
    const { data: ourSwimmers } = await supabase
      .from("swimmers")
      .select("id, participant_id")
      .not("participant_id", "is", null);
    const participantBySwimmer = new Map((ourSwimmers ?? []).map((w) => [w.id, w.participant_id]));
    const ourIds = [...participantBySwimmer.keys()];

    const pairs = new Map(); // `${competition}|${participant}` -> { competitionId, participantId }
    if (ourIds.length > 0) {
      const [{ data: swimRows }, { data: legRows }] = await Promise.all([
        supabase.from("swim_results").select("competition_id, swimmer_id").in("swimmer_id", ourIds).in("competition_id", compIds),
        supabase
          .from("swim_relay_legs")
          .select("swimmer_id, swim_relay_teams!inner(competition_id)")
          .in("swimmer_id", ourIds)
          .in("swim_relay_teams.competition_id", compIds),
      ]);
      const addPair = (competitionId, swimmerId) => {
        const participantId = participantBySwimmer.get(swimmerId);
        if (competitionId && participantId) pairs.set(`${competitionId}|${participantId}`, { competitionId, participantId });
      };
      (swimRows ?? []).forEach((r) => addPair(r.competition_id, r.swimmer_id));
      (legRows ?? []).forEach((l) => addPair(l.swim_relay_teams?.competition_id, l.swimmer_id));
    }

    swimEvents = [...pairs.values()]
      .map(({ competitionId, participantId }) => {
        const comp = competitions.find((c) => c.id === competitionId);
        if (!comp || plannedCover.has(`${participantId}|${comp.competition_date}`)) return null;
        const title = comp.name || "Compétition";
        return {
          key: `sw-${competitionId}-${participantId}`,
          date: comp.competition_date,
          time: null,
          sportSlug: "natation",
          participantId,
          title,
          subtitle: (comp.city || "LIEU INCONNU").toUpperCase(),
          detail: swimDetail({
            title,
            city: comp.city,
            poolLength: comp.pool_length,
            dateStr: comp.competition_date,
            nbDays: 1,
            time: null,
            ffnLink: ffnCompetitionResultsUrl(comp.ffn_competition_id),
            liveLink: ffnLiveUrl(comp.ffn_competition_id),
          }),
        };
      })
      .filter(Boolean);
  }

  let plannedEvents = [];
  (plannedRows ?? []).forEach((row) => {
    const location = (row.location || "LIEU INCONNU").toUpperCase();
    const base = {
      key: `swp-${row.id}`,
      date: row.start_date,
      time: row.start_time,
      sportSlug: "natation",
      participantId: row.participant_sports?.participant_id,
      title: row.title || "Compétition",
      subtitle: row.start_time ? `${row.start_time} : ${location}` : location,
      detail: swimDetail({
        title: row.title || "Compétition",
        city: row.location,
        poolLength: row.pool_length,
        dateStr: row.start_date,
        nbDays: row.nb_days,
        time: row.start_time,
        level: row.categories,
        comment: row.comment,
        ffnLink: row.ffn_link,
        // Si le lien saisi contient l'identifiant FFN, on en déduit le live.
        liveLink: ffnLiveUrl(ffnCompetitionIdFromLink(row.ffn_link)),
      }),
    };
    if (base.date >= startDateStr && base.date < endDateStr) {
      plannedEvents.push(base);
    }
    plannedEvents.push(...buildContinuationEntries(base, row.nb_days, startDateStr, endDateStr));
  });

  // ---- Autres sports (plongée, triathlon, course à pied, parapente...) —
  // même logique que le calendrier prévisionnel natation, avec bandeaux de
  // continuation sur les événements de plusieurs jours.
  const { data: otherSportRows } = await supabase
    .from("other_sport_results")
    .select("*, sports(slug)")
    .gte("result_date", lookbackDateStr)
    .lt("result_date", endDateStr);

  let otherSportEvents = [];
  (otherSportRows ?? []).forEach((row) => {
    const location = (row.location || "LIEU INCONNU").toUpperCase();
    const base = {
      key: `os-${row.id}`,
      date: row.result_date,
      time: row.event_time,
      sportSlug: row.sports?.slug,
      participantId: row.participant_id,
      title: row.title || row.sports?.name || "Événement",
      subtitle: row.event_time ? `${row.event_time} : ${location}` : location,
      detail: {
        kind: "other",
        title: row.title || row.sports?.name || "Événement",
        dateText: swimDateText(row.result_date, row.nb_days, row.event_time),
        addressLines: row.location ? [row.location] : [],
        mapsUrl: mapsLink(row.location),
      },
    };
    if (base.date >= startDateStr && base.date < endDateStr) {
      otherSportEvents.push(base);
    }
    otherSportEvents.push(...buildContinuationEntries(base, row.nb_days, startDateStr, endDateStr));
  });

  let events = [...basketEvents, ...swimEvents, ...plannedEvents, ...otherSportEvents];
  if (selectedParticipantId) {
    events = events.filter((e) => e.participantId === selectedParticipantId);
  }
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (!a.time) return -1;
    if (!b.time) return 1;
    return a.time.localeCompare(b.time);
  });

  const byDate = {};
  events.forEach((e) => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });
  const sortedDates = Object.keys(byDate).sort();

  const todayStr = now.toISOString().slice(0, 10);

  const feedSecret = process.env.CALENDAR_FEED_SECRET;
  const host = headers().get("host");
  const proto = host?.startsWith("localhost") ? "http" : "https";
  const feedUrl = feedSecret ? `${proto}://${host}/calendrier/${feedSecret}/feed.ics` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight text-navy">Calendrier</h1>
          <p className="mt-1 text-ink/60">Tous les événements à venir, en un coup d'œil.</p>
        </div>

        <details className="rounded-card bg-white p-3 shadow-sm">
          <summary className="cursor-pointer whitespace-nowrap rounded-full bg-lagoon px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            📅 Abonnement calendrier
          </summary>

          <div className="mt-3 max-w-sm text-xs text-ink/60">
            {feedUrl ? (
              <>
                <p className="mb-2">
                  Ce lien donne un accès en lecture seule à ton calendrier — ne le partage qu'avec les
                  personnes de confiance.
                </p>
                <input
                  readOnly
                  value={feedUrl}
                  className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-[11px] text-ink"
                />
                <p className="mt-3 font-semibold text-ink/70">Dans Google Calendar :</p>
                <ol className="mt-1 list-decimal space-y-1 pl-4">
                  <li>Sélectionne le lien ci-dessus et copie-le (Ctrl/Cmd+C).</li>
                  <li>
                    Sur calendar.google.com, en bas à gauche de "Autres agendas", clique sur{" "}
                    <strong>+</strong> puis <strong>"À partir de l'URL"</strong>.
                  </li>
                  <li>Colle le lien, puis "Ajouter un agenda".</li>
                </ol>
                <p className="mt-2 text-ink/40">
                  Google se resynchronise automatiquement toutes les quelques heures — pas en temps réel,
                  mais sans rien faire de ton côté.
                </p>
              </>
            ) : (
              <p className="text-cardinal-dark">
                Variable d'environnement <code>CALENDAR_FEED_SECRET</code> manquante côté serveur —
                défini une valeur secrète (une longue chaîne aléatoire) pour activer l'abonnement.
              </p>
            )}
          </div>
        </details>
      </div>

      {(!participants || participants.length === 0) ? (
        <div className="rounded-card bg-white p-8 text-center shadow-sm">
          <p className="mb-4 text-ink/60">Aucun participant configuré pour l'instant.</p>
          <Link
            href="/parametres"
            className="inline-block rounded-full bg-navy px-5 py-2 font-semibold text-white hover:bg-navy-light"
          >
            Aller dans Paramètres
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Link
              href={homeHref({ month, year })}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm ${
                !selectedParticipantId ? "bg-navy text-white" : "bg-white text-ink/60"
              }`}
            >
              Toutes
            </Link>
            {participants.map((p) => {
              const color = colorByParticipant.get(p.id);
              const active = selectedParticipantId === p.id;
              return (
                <Link
                  key={p.id}
                  href={homeHref({ month, year, participant: p.id })}
                  className="rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm"
                  style={{
                    backgroundColor: active ? color : "white",
                    color: active ? "white" : color,
                  }}
                >
                  {p.first_name}
                </Link>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-card shadow-sm">
            <div className="bg-navy px-4 pb-3 pt-3 text-white">
              <div className="flex items-center justify-between">
                <Link
                  href={homeHref({ month, year: year - 1, participant: selectedParticipantId })}
                  aria-label="Année précédente"
                  className="px-2 text-lg font-bold hover:text-cardinal-light"
                >
                  ‹
                </Link>
                <span className="font-display text-sm uppercase tracking-tight">{year}</span>
                <Link
                  href={homeHref({ month, year: year + 1, participant: selectedParticipantId })}
                  aria-label="Année suivante"
                  className="px-2 text-lg font-bold hover:text-cardinal-light"
                >
                  ›
                </Link>
              </div>
              <div className="mt-2 grid grid-cols-6 gap-1 sm:grid-cols-12">
                {MONTH_SHORT.map((label, i) => {
                  const m = i + 1;
                  const active = m === month;
                  const isNow = m === now.getMonth() + 1 && year === now.getFullYear();
                  return (
                    <Link
                      key={m}
                      href={homeHref({ month: m, year, participant: selectedParticipantId })}
                      aria-current={active ? "true" : undefined}
                      title={`${capitalize(MONTH_NAMES[i])} ${year}`}
                      className={`rounded-full px-1 py-1.5 text-center text-xs font-semibold capitalize ${
                        active
                          ? "bg-white text-navy"
                          : isNow
                          ? "text-white ring-1 ring-white/50 hover:bg-white/10"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="divide-y divide-ink/5 bg-white">
              {sortedDates.length === 0 ? (
                <p className="p-6 text-center text-sm text-ink/50">
                  Aucun événement {selectedParticipantId ? "pour ce participant " : ""}sur {MONTH_NAMES[month - 1]}{" "}
                  {year}.
                </p>
              ) : (
                sortedDates.map((date) => (
                  <div key={date} className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-4">
                    <div className={`w-32 shrink-0 text-sm font-semibold ${date === todayStr ? "text-cardinal" : "text-ink/50"}`}>
                      {formatDate(date, { year: false })}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {byDate[date].map((e) =>
                        e.continuation ? (
                          <div
                            key={e.key}
                            className="h-3 rounded-full"
                            style={{ backgroundColor: colorByParticipant.get(e.participantId) ?? "#607D8B" }}
                            title="Compétition sur plusieurs jours"
                          />
                        ) : (
                          <CalendarEvent
                            key={e.key}
                            event={{
                              title: e.title,
                              subtitle: e.subtitle,
                              icon: iconFor(e.sportSlug),
                              color: colorByParticipant.get(e.participantId) ?? "#607D8B",
                              detail: e.detail ?? null,
                            }}
                          />
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
