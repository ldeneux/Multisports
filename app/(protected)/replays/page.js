import { createClient } from "@/lib/supabase/server";
import { embedUrl } from "@/lib/replays";
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
  ] = await Promise.all([
    supabase
      .from("replay_groups")
      .select(
        "id, title, sport, recorded_on, season, team, division, match_id, created_at, replay_chapters(id, label, subtitle, url, provider, video_ref, position)"
      ),
    supabase
      .from("basketball_matches")
      .select(
        "id, team1_name, team2_name, match_date, season, division_label, us_is_team1, phase_id, participant_sport_id"
      )
      .not("us_is_team1", "is", null)
      .order("match_date", { ascending: true }),
    supabase.from("basketball_phases").select("id, phase_name, position"),
    supabase.from("participant_sports").select("id, category, participants(first_name)"),
  ]);

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
      who: ps?.participants?.first_name ?? "",
      team: ps?.category ?? "",
      phaseId: m.phase_id ?? "",
      phaseName: phase?.phase_name ?? "Sans phase",
      phasePos: phase?.position ?? 0,
    };
  });

  // Plus récents d'abord : date du match / de la compétition si connue, sinon date d'ajout.
  const sortKey = (g) => g.recorded_on ?? String(g.created_at).slice(0, 10);
  const sorted = [...(groupRows ?? [])].sort(
    (a, b) => sortKey(b).localeCompare(sortKey(a)) || String(b.created_at).localeCompare(String(a.created_at))
  );

  const groups = sorted.map((g) => ({
    id: g.id,
    title: g.title,
    sport: g.sport,
    recordedOn: g.recorded_on,
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
      <ReplayForm matches={matches} defaultMatchId={preselected} startOpen={Boolean(preselected) || groups.length === 0} />
      <ReplayList groups={groups} />
    </div>
  );
}
