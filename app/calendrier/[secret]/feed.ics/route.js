import { createClient } from "@supabase/supabase-js";
import { buildIcsCalendar, buildIcsEvent } from "@/lib/ics";

export const dynamic = "force-dynamic";

function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request, { params }) {
  const expectedSecret = process.env.CALENDAR_FEED_SECRET;
  if (!expectedSecret) {
    return new Response(
      "CALENDAR_FEED_SECRET n'est pas configuré côté serveur (variable d'environnement manquante).",
      { status: 500 }
    );
  }
  if (params.secret !== expectedSecret) {
    return new Response("Lien invalide.", { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return new Response(
      "SUPABASE_SERVICE_ROLE_KEY n'est pas configuré côté serveur (nécessaire pour lire les données sans session utilisateur).",
      { status: 500 }
    );
  }

  // Client à clé de service : Google Calendar n'a pas de session de
  // connexion, donc pas de cookie — le client habituel (basé sur la
  // session) ne verrait rien à cause des policies RLS ("authenticated"
  // uniquement). L'accès est protégé à la place par le jeton secret dans
  // l'URL, vérifié juste au-dessus.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    db: { schema: "multisports" },
  });

  const { data: participants } = await supabase.from("participants").select("id, first_name");
  const nameById = new Map((participants ?? []).map((p) => [p.id, p.first_name]));

  const todayStr = new Date().toISOString().slice(0, 10);
  // Quelques jours dans le passé pour ne pas faire disparaître d'un coup un
  // événement tout juste passé, puis pas de limite dans le futur.
  const fromStr = addDaysStr(todayStr, -7);
  const fromIso = `${fromStr}T00:00:00.000Z`;

  const events = [];

  // ---- Basket -----------------------------------------------------------
  const { data: bbMatches } = await supabase
    .from("basketball_matches")
    .select("*, participant_sports(participant_id)")
    .gte("match_date", fromIso)
    .not("us_is_team1", "is", null)
    .order("match_date");

  (bbMatches ?? [])
    .filter((m) => m.match_date)
    .forEach((m) => {
      const opponent = (m.us_is_team1 ? m.team2_name : m.team1_name) || "Adversaire inconnu";
      const participantName = nameById.get(m.participant_sports?.participant_id) || "";
      const d = new Date(m.match_date);
      events.push(
        buildIcsEvent({
          uid: `bb-${m.id}@sport-famille`,
          summary: `🏀 ${participantName ? `${participantName} — ` : ""}vs ${opponent}`,
          location: m.location || "",
          allDay: false,
          date: d.toISOString().slice(0, 10),
          time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
          durationMinutes: 90,
        })
      );
    });

  // ---- Natation (compétitions déjà synchronisées avec résultats) --------
  const { data: competitions } = await supabase
    .from("swim_competitions")
    .select("*")
    .gte("competition_date", fromStr);

  if (competitions && competitions.length > 0) {
    const { data: swimRows } = await supabase
      .from("swim_results")
      .select("competition_id, swimmer_id, swimmers(participant_id)")
      .in(
        "competition_id",
        competitions.map((c) => c.id)
      );

    const seen = new Set();
    (swimRows ?? [])
      .filter((r) => r.swimmers?.participant_id)
      .forEach((r) => {
        const dedupeKey = `${r.competition_id}-${r.swimmers.participant_id}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        const comp = competitions.find((c) => c.id === r.competition_id);
        const participantName = nameById.get(r.swimmers.participant_id) || "";
        events.push(
          buildIcsEvent({
            uid: `sw-${r.competition_id}-${r.swimmers.participant_id}@sport-famille`,
            summary: `🏊 ${participantName ? `${participantName} — ` : ""}${comp?.name || "Compétition"}`,
            location: comp?.city || "",
            allDay: true,
            date: comp?.competition_date,
          })
        );
      });
  }

  // ---- Natation (calendrier prévisionnel saisi à la main) ----------------
  const { data: plannedRows } = await supabase
    .from("swim_planned_competitions")
    .select("*, participant_sports(participant_id)")
    .gte("start_date", fromStr);

  (plannedRows ?? []).forEach((row) => {
    const participantName = nameById.get(row.participant_sports?.participant_id) || "";
    events.push(
      buildIcsEvent({
        uid: `swp-${row.id}@sport-famille`,
        summary: `🏊 ${participantName ? `${participantName} — ` : ""}${row.title || "Compétition"}`,
        location: row.location || "",
        description: row.comment || "",
        allDay: !row.start_time,
        date: row.start_date,
        time: row.start_time,
        nbDays: row.nb_days,
      })
    );
  });

  // ---- Autres sports (plongée, triathlon, course à pied, parapente...) --
  const { data: otherSportRows } = await supabase
    .from("other_sport_results")
    .select("*, sports(name)")
    .gte("result_date", fromStr);

  (otherSportRows ?? []).forEach((row) => {
    const participantName = nameById.get(row.participant_id) || "";
    events.push(
      buildIcsEvent({
        uid: `os-${row.id}@sport-famille`,
        summary: `${participantName ? `${participantName} — ` : ""}${row.title || row.sports?.name || "Événement"}`,
        location: row.location || "",
        description: row.notes || "",
        allDay: !row.event_time,
        date: row.result_date,
        time: row.event_time,
        nbDays: row.nb_days,
      })
    );
  });

  const ics = buildIcsCalendar(events);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="sport-famille.ics"',
      "Cache-Control": "public, max-age=1800",
    },
  });
}
