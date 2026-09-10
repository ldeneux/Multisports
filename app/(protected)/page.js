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
  "course-a-pied": "🏃",
  velo: "🚴",
  cyclisme: "🚴",
  plongee: "🤿",
  ulm: "🛩️",
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
    .order("match_date");

  const basketEvents = (bbMatches ?? [])
    .filter((m) => m.match_date)
    .map((m) => {
      const participantId = m.participant_sports?.participant_id;
      const opponent = m.us_is_team1 === false ? m.team1_name : m.team2_name;
      const d = new Date(m.match_date);
      return {
        key: `bb-${m.id}`,
        date: m.match_date.slice(0, 10),
        time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        sportSlug: "basket",
        participantId,
        participantName: m.participant_sports?.participants?.first_name,
        title: opponent ? `vs ${opponent}` : "Match",
        location: m.location || "Lieu à confirmer",
        href: `/basket?ps=${m.participant_sport_id}&tab=calendrier`,
      };
    });

  // ---- Natation : compétitions du mois où une de nos filles (pas les
  // nageuses "suivies" d'autres clubs) a un résultat enregistré. Limite
  // connue : la synchro FFN récupère les compétitions via leurs RÉSULTATS,
  // donc une compétition future sans résultat publié n'apparaît pas encore
  // ici — elle remontera dès que la FFN aura publié ses résultats.
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
        return {
          key: `sw-${r.competition_id}-${r.swimmers.participant_id}`,
          date: comp?.competition_date,
          time: null,
          sportSlug: "natation",
          participantId: r.swimmers.participant_id,
          participantName: r.swimmers.participants?.first_name,
          title: comp?.name || comp?.city || "Compétition",
          location: comp?.city || "Lieu inconnu",
          href: "/natation?tab=performances",
        };
      });
  }

  let events = [...basketEvents, ...swimEvents];
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
                    <div className="flex-1 space-y-2">
                      {byDate[date].map((e) => (
                        <Link
                          key={e.key}
                          href={e.href}
                          className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-sand"
                        >
                          <span className="w-6 shrink-0 text-center text-lg" aria-hidden="true">
                            {iconFor(e.sportSlug)}
                          </span>
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: colorByParticipant.get(e.participantId) ?? "#999" }}
                            title={e.participantName}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {e.participantName ? `${e.participantName} — ` : ""}
                              {e.title}
                            </span>
                            <span className="block truncate text-xs text-ink/50">
                              {e.time ? `${e.time} : ${e.location}` : `Toute la journée : ${e.location}`}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <Link href="/parametres" className="text-sm font-semibold text-navy hover:underline">
              Gérer les participants, sports et affectations →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
