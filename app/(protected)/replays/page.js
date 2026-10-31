import { createClient } from "@/lib/supabase/server";
import { embedUrl } from "@/lib/replays";
import { ReplayForm, ReplayList } from "@/components/ReplaysClient";

export const dynamic = "force-dynamic";

// m.match_date est stocké en « heure de Paris lue comme UTC » : on l'affiche donc en UTC.
function shortDate(value) {
  return new Date(value).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}

export default async function ReplaysPage({ searchParams }) {
  const supabase = createClient();

  const [{ data: groupRows, error: groupError }, { data: matchRows }] = await Promise.all([
    supabase
      .from("replay_groups")
      .select(
        "id, title, sport, recorded_on, season, team, division, match_id, created_at, replay_chapters(id, label, url, provider, video_ref, position)"
      ),
    supabase
      .from("basketball_matches")
      .select("id, team1_name, team2_name, match_date, season, division_label")
      .not("us_is_team1", "is", null)
      .order("match_date", { ascending: false }),
  ]);

  // Pour préremplir le formulaire quand on choisit un match.
  const matches = (matchRows ?? []).map((m) => ({
    id: m.id,
    label: `${shortDate(m.match_date)} · ${m.team1_name} – ${m.team2_name}`,
    title: `${m.team1_name} – ${m.team2_name}`,
    date: new Date(m.match_date).toISOString().slice(0, 10),
    season: m.season ?? "",
    division: m.division_label ?? "",
  }));

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
