import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

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

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  // ---- Basket : matchs du mois, toujours "les nôtres" (pas de notion de
  // "suivi" côté basket comme pour la natation). ----------------------------
  const { data: bbMatches } = await supabase
    .from("basketball_matches")
    .select("*, participant_sports(participant_id, participants(first_name))")
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

  const basketEvents = (bbMatches ?? [])
    .filter((m) => m.match_date)
    .map((m) => {
      const participantId = m.participant_sports?.participant_id;
      const d = new Date(m.match_date);
      // L'adversaire, pas l'équipe qui reçoit — à domicile, l'équipe qui
      // reçoit est presque toujours la nôtre, ce serait redondant/inutile
      // de l'afficher (ex. systématiquement "OLYMPIC SATHONAY").
      const opponentName = (m.us_is_team1 ? m.team2_name : m.team1_name) || "Adversaire inconnu";
      return {
        key: `bb-${m.id}`,
        date: m.match_date.slice(0, 10),
        time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        sportSlug: "basket",
        participantId,
        title: opponentName,
        subtitle: `${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} : ${invertLocation(
          m.location || ""
        )}`,
      };
    });

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

  let swimEvents = [];
  if (competitions && competitions.length > 0) {
    const { data: swimRows } = await supabase
      .from("swim_results")
      .select("competition_id, swimmer_id, swimmers(participant_id, full_name, participants(first_name))")
      .in(
        "competition_id",
        competitions.map((c) => c.id)
      );

    const seen = new Set();
    swimEvents = (swimRows ?? [])
      .filter((r) => r.swimmers?.participant_id)
      .filter((r) => {
        const dedupeKey = `${r.competition_id}-${r.swimmers.participant_id}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      })
      .map((r) => {
        const comp = competitions.find((c) => c.id === r.competition_id);
        const title = comp?.name || "Compétition";
        return {
          key: `sw-${r.competition_id}-${r.swimmers.participant_id}`,
          date: comp?.competition_date,
          time: null,
          sportSlug: "natation",
          participantId: r.swimmers.participant_id,
          title,
          subtitle: (comp?.city || "LIEU INCONNU").toUpperCase(),
        };
      });
  }

  // Compétitions natation à venir saisies à la main (le calendrier
  // prévisionnel de la page Natation) — seule source pour les événements
  // natation réellement à venir, y compris sur plusieurs jours.
  const { data: plannedRows } = await supabase
    .from("swim_planned_competitions")
    .select("*, participant_sports(participant_id, participants(first_name))")
    .gte("start_date", lookbackDateStr)
    .lt("start_date", endDateStr);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">Calendrier</h1>
        <p className="mt-1 text-ink/60">Tous les événements à venir, en un coup d'œil.</p>
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
            <div className="flex items-center justify-between bg-navy px-4 py-3 text-white">
              <Link href={homeHref({ month: prevMonth, year: prevYear, participant: selectedParticipantId })} className="px-2 text-lg font-bold hover:text-cardinal-light">
                ‹
              </Link>
              <span className="font-display text-sm uppercase tracking-tight">
                {MONTH_NAMES[month - 1]} {year}
              </span>
              <Link href={homeHref({ month: nextMonth, year: nextYear, participant: selectedParticipantId })} className="px-2 text-lg font-bold hover:text-cardinal-light">
                ›
              </Link>
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
                          <div
                            key={e.key}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-white"
                            style={{ backgroundColor: colorByParticipant.get(e.participantId) ?? "#607D8B" }}
                          >
                            <span className="w-5 shrink-0 text-center text-base" aria-hidden="true">
                              {iconFor(e.sportSlug)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{e.title}</span>
                              <span className="block truncate text-xs text-white/75">{e.subtitle}</span>
                            </span>
                          </div>
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
