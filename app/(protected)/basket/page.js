import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import SyncButton from "@/components/SyncButton";
import {
  addMatch,
  recordScore,
  deleteMatch,
  updateFfbbId,
  syncFfbbMatches,
} from "./actions";

export const dynamic = "force-dynamic";

function MatchRow({ m }) {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-sand p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-ink">
          vs {m.opponent}
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
              m.source === "ffbb"
                ? "bg-lagoon-light text-navy"
                : "bg-white text-ink/50"
            }`}
          >
            {m.source === "ffbb" ? "FFBB" : "Manuel"}
          </span>
        </p>
        <p className="text-sm text-ink/50">
          {m.match_date ? formatDateTime(m.match_date) : "Date inconnue"}
          {m.home_away && ` · ${m.home_away === "domicile" ? "Domicile" : "Extérieur"}`}
          {m.location ? ` · ${m.location}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {m.status === "joue" ? (
          <p className="font-display text-lg text-navy">
            {m.team_score_us ?? "–"} - {m.team_score_them ?? "–"}
          </p>
        ) : (
          <form action={recordScore} className="flex items-center gap-1.5">
            <input type="hidden" name="match_id" value={m.id} />
            <input
              type="number" min="0" name="team_score_us" placeholder="Nous"
              className="w-14 rounded-lg border border-ink/15 px-1.5 py-1 text-sm"
            />
            <span className="text-ink/40">-</span>
            <input
              type="number" min="0" name="team_score_them" placeholder="Eux"
              className="w-14 rounded-lg border border-ink/15 px-1.5 py-1 text-sm"
            />
            <button
              type="submit"
              className="rounded-full bg-navy px-2.5 py-1 text-xs font-semibold text-white hover:bg-navy-light"
            >
              OK
            </button>
          </form>
        )}

        <form action={deleteMatch}>
          <input type="hidden" name="match_id" value={m.id} />
          <button type="submit" className="text-xs font-semibold text-ink/30 hover:text-cardinal">
            ✕
          </button>
        </form>
      </div>
    </div>
  );
}

function ParticipantSection({ ps, matches }) {
  const upcoming = matches.filter((m) => m.status !== "joue");
  const played = matches.filter((m) => m.status === "joue");

  return (
    <div className="rounded-card bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl uppercase tracking-tight text-navy">
            {ps.participants?.first_name}
          </p>
          <p className="text-sm text-ink/50">
            {ps.club ?? "Club non renseigné"}
            {ps.category ? ` · ${ps.category}` : ""}
          </p>
          {ps.link_url && (
            <a
              href={ps.link_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-cardinal hover:underline"
            >
              Page officielle FFBB →
            </a>
          )}
        </div>

        <form action={syncFfbbMatches}>
          <input type="hidden" name="participant_sport_id" value={ps.id} />
          <SyncButton className="rounded-full bg-lagoon px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
            Synchroniser FFBB
          </SyncButton>
        </form>
      </div>

      <div className="mt-3 rounded-lg bg-sand p-3 text-sm">
        <form action={updateFfbbId} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="participant_sport_id" value={ps.id} />
          <label className="text-xs font-semibold text-ink/50">
            ID FFBB (engagement)
          </label>
          <input
            name="ffbb_engagement_id"
            defaultValue={ps.ffbb_engagement_id ?? ""}
            placeholder="ex. 200000005251991"
            className="w-48 rounded-lg border border-ink/15 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white hover:bg-navy-light"
          >
            Enregistrer
          </button>
        </form>

        {ps.last_ffbb_sync_at && (
          <p className={`mt-2 text-xs ${ps.last_ffbb_sync_error ? "text-cardinal-dark" : "text-ink/40"}`}>
            Dernière synchro : {formatDateTime(ps.last_ffbb_sync_at)}
            {ps.last_ffbb_sync_error ? ` — ${ps.last_ffbb_sync_error}` : " — OK"}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {upcoming.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40">
              À venir
            </p>
            <div className="space-y-1.5">
              {upcoming.map((m) => <MatchRow key={m.id} m={m} />)}
            </div>
          </div>
        )}

        {played.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40">
              Joués
            </p>
            <div className="space-y-1.5">
              {played.map((m) => <MatchRow key={m.id} m={m} />)}
            </div>
          </div>
        )}

        {matches.length === 0 && (
          <p className="text-sm text-ink/40">Aucun match enregistré pour l'instant.</p>
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-navy">
          Ajouter un match manuellement
        </summary>
        <form action={addMatch} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="participant_sport_id" value={ps.id} />
          <input
            type="datetime-local" name="match_date" required
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
          />
          <select name="home_away" className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm">
            <option value="domicile">Domicile</option>
            <option value="exterieur">Extérieur</option>
          </select>
          <input
            name="opponent" placeholder="Adversaire" required
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm sm:col-span-2"
          />
          <input
            name="location" placeholder="Lieu / salle"
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            className="rounded-full bg-cardinal px-4 py-1.5 text-sm font-semibold text-white hover:bg-cardinal-dark sm:col-span-2 sm:w-fit"
          >
            Ajouter
          </button>
        </form>
      </details>
    </div>
  );
}

export default async function BasketPage() {
  const supabase = createClient();

  const { data: sport } = await supabase
    .from("sports")
    .select("id, name")
    .eq("slug", "basket")
    .maybeSingle();

  const { data: assignments } = sport
    ? await supabase
        .from("participant_sports")
        .select("*, participants(id, first_name)")
        .eq("sport_id", sport.id)
    : { data: [] };

  const psIds = (assignments ?? []).map((a) => a.id);

  const { data: allMatches } = psIds.length
    ? await supabase
        .from("basketball_matches")
        .select("*")
        .in("participant_sport_id", psIds)
        .order("match_date", { ascending: true })
    : { data: [] };

  const matchesByPs = {};
  (allMatches ?? []).forEach((m) => {
    if (!matchesByPs[m.participant_sport_id]) matchesByPs[m.participant_sport_id] = [];
    matchesByPs[m.participant_sport_id].push(m);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
          Basket
        </h1>
        <p className="mt-1 text-ink/60">
          Calendrier et résultats, synchronisables depuis la FFBB.
        </p>
      </div>

      <p className="rounded-card bg-lagoon-light p-3 text-xs text-navy">
        La synchronisation FFBB utilise une API non officielle (reverse engineering).
        Elle peut échouer ou nécessiter de renseigner l'ID FFBB à la main — le message
        d'erreur sous chaque participant t'indique quoi faire dans ce cas.
      </p>

      {(!assignments || assignments.length === 0) ? (
        <div className="rounded-card bg-white p-8 text-center shadow-sm">
          <p className="text-ink/60">
            Personne n'est encore associé au basket. Configure ça dans Paramètres.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((ps) => (
            <ParticipantSection key={ps.id} ps={ps} matches={matchesByPs[ps.id] ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}
