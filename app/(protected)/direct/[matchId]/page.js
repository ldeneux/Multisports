import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import LiveRoom from "@/components/LiveRoom";

export const dynamic = "force-dynamic";

export default async function DirectPage({ params }) {
  const supabase = createClient();
  const { data: match } = await supabase
    .from("basketball_matches")
    .select("id, team1_name, team2_name, match_date, location")
    .eq("id", params.matchId)
    .maybeSingle();
  if (!match) notFound();

  return (
    <div className="space-y-4">
      <Link href="/basket" className="text-sm font-semibold text-lagoon hover:underline">
        ← Retour au calendrier
      </Link>
      <div className="rounded-card bg-white p-4 shadow-sm">
        <h1 className="font-display text-xl font-bold text-navy">
          {match.team1_name} – {match.team2_name}
        </h1>
        <p className="text-sm text-ink/60">
          {formatDateTime(match.match_date)}
          {match.location ? ` · ${match.location}` : ""}
        </p>
      </div>
      <LiveRoom matchId={match.id} />
    </div>
  );
}
