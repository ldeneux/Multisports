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

  const [{ data: replayRows, error: replayError }, { data: matchRows }] = await Promise.all([
    supabase
      .from("replays")
      .select("id, title, url, provider, video_ref, sport, recorded_on, match_id, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("basketball_matches")
      .select("id, team1_name, team2_name, match_date")
      .not("us_is_team1", "is", null)
      .order("match_date", { ascending: false }),
  ]);

  const matchLabel = new Map(
    (matchRows ?? []).map((m) => [m.id, `${shortDate(m.match_date)} · ${m.team1_name} – ${m.team2_name}`])
  );
  const matches = (matchRows ?? []).map((m) => ({ id: m.id, label: matchLabel.get(m.id) }));

  // Plus récents d'abord : date du replay si elle est connue, sinon date d'ajout.
  const sortKey = (r) => r.recorded_on ?? String(r.created_at).slice(0, 10);
  const sortedRows = [...(replayRows ?? [])].sort(
    (a, b) => sortKey(b).localeCompare(sortKey(a)) || String(b.created_at).localeCompare(String(a.created_at))
  );

  const replays = sortedRows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    provider: r.provider,
    embed: embedUrl(r.provider, r.video_ref),
    sport: r.sport,
    recordedOn: r.recorded_on,
    matchLabel: r.match_id ? matchLabel.get(r.match_id) ?? "" : "",
  }));

  const preselected = matches.some((m) => m.id === searchParams?.match) ? searchParams.match : "";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-navy">Replays</h1>
      {replayError && (
        <p className="rounded-card bg-cardinal-light p-3 text-sm text-cardinal-dark">
          Impossible de lire les replays : {replayError.message} (as-tu exécuté supabase/7-replays.sql ?)
        </p>
      )}
      <ReplayForm matches={matches} defaultMatchId={preselected} />
      <ReplayList replays={replays} />
    </div>
  );
}
