import { createClient } from "@/lib/supabase/server";
import { embedUrl } from "@/lib/replays";
import { PARTICIPANT_COLORS } from "@/lib/participantColors";
import { ReplayForm, ReplayList } from "@/components/ReplaysClient";

export const dynamic = "force-dynamic";

// m.match_date est stocké en « heure de Paris lue comme UTC » : on l'affiche donc en UTC.
function shortDate(value) {
  return new Date(value).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function ReplaysPage({ searchParams }) {
  const supabase = createClient();

  const [
    { data: groupRows, error: groupError },
    { data: matchRows },
    { data: phaseRows },
    { data: psRows },
    { data: participantRows },
  ] = await Promise.all([
    // « * » : participant_id est lu s'il existe (colonne ajoutée par supabase/11-replays-participant.sql).
    supabase
      .from("replay_groups")
      .select("*, replay_chapters(id, label, subtitle, url, provider, video_ref, position)"),
    supabase
      .from("basketball_matches")
      .select(
        "id, team1_name, team2_name, match_date, season, division_label, us_is_team1, phase_id, participant_sport_id"
      )
      .not("us_is_team1", "is", null)
      .order("match_date", { ascending: true }),
    supabase.from("basketball_phases").select("id, phase_name, position"),
    supabase.from("participant_sports").select("id, category, participant_id, participants(first_name)"),
    supabase.from("participants").select("id, first_name").order("birthdate"),
  ]);

  // Participants (même ordre et mêmes couleurs que les pastilles du calendrier)
  const participants = (participantRows ?? []).map((p, i) => ({
    id: p.id,
    firstName: p.first_name,
    color: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length],
  }));

  const phaseById = new Map((phaseRows ?? []).map((ph) => [ph.id, ph]));
  const psById = new Map((psRows ?? []).map((ps) => [ps.id, ps]));

  // Pour le sélecteur de match (Saison → Équipe → Phase → Match, ou recherche par adversaire)
  const matches = (matchRows ?? []).map((m) => {
    const ps = psById.get(m.participant_sport_id);
    const phase = phaseById.get(m.phase_id);
    return {
      id: m.id,
      title: `${m.team1_name} – ${m.team2_name}`,
      date: new Date(m.match_date).toISOString().slice(0, 10),
      shortDate: shortDate(m.match_date),
      season: m.season ?? "",
      division: m.division_label ?? "",
      opponent: (m.us_is_team1 ? m.team2_name : m.team1_name) ?? "",
      home: m.us_is_team1 === true,
      psId: m.participant_sport_id ?? "",
      participantId: ps?.participant_id ?? "",
      who: ps?.participants?.first_name ?? "",
      team: ps?.category ?? "",
      phaseId: m.phase_id ?? "",
      phaseName: phase?.phase_name ?? "Sans phase",
      phasePos: phase?.position ?? 0,
    };
  });

  // Date d'un replay : celle qui est enregistrée, sinon la date du match de basket lié, sinon la date d'ajout.
  // Elle sert à la fois à l'affichage (sous le titre) et au tri, pour que l'ordre suive toujours la date affichée.
  const matchDate = new Map(matches.map((m) => [m.id, m.date]));
  const dateOf = (g) => g.recorded_on ?? matchDate.get(g.match_id) ?? String(g.created_at).slice(0, 10);

  // Les plus récents d'abord (à date égale : le dernier ajouté en premier).
  const sorted = [...(groupRows ?? [])].sort(
    (a, b) => dateOf(b).localeCompare(dateOf(a)) || String(b.created_at).localeCompare(String(a.created_at))
  );

  // Participant d'un replay : celui qui est enregistré, sinon celui du match de basket lié.
  const matchParticipant = new Map(matches.map((m) => [m.id, m.participantId]));

  const groups = sorted.map((g) => ({
    id: g.id,
    participantId: g.participant_id ?? matchParticipant.get(g.match_id) ?? "",
    title: g.title,
    sport: g.sport,
    recordedOn: g.recorded_on,
    date: dateOf(g),
    season: g.season ?? "",
    team: g.team ?? "",
    division: g.division ?? "",
    chapters: [...(g.replay_chapters ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        label: c.label,
        subtitle: c.subtitle ?? "",
        url: c.url,
        provider: c.provider,
        embed: embedUrl(c.provider, c.video_ref),
        ref: c.video_ref,
      })),
  }));

  const preselected = matches.some((m) => m.id === searchParams?.match) ? searchParams.match : "";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-navy">Replays</h1>
      {groupError && (
        <p className="rounded-card bg-cardinal-light p-3 text-sm text-cardinal-dark">
          Impossible de lire les replays : {groupError.message} (as-tu exécuté supabase/7-replays.sql ?)
        </p>
      )}
      <ReplayForm
        matches={matches}
        participants={participants}
        defaultMatchId={preselected}
        startOpen={Boolean(preselected) || groups.length === 0}
      />
      <ReplayList groups={groups} participants={participants} />
    </div>
  );
}
