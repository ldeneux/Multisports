import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, msToSwimTime } from "@/lib/utils";
import { addResult, deleteResult, updateFfnId, syncFfnResults } from "./actions";

export const dynamic = "force-dynamic";

function ResultRow({ r }) {
  return (
    <div className="flex flex-col gap-1 rounded-card bg-sand p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-ink">
          {r.event_name}
          {r.pool_length && (
            <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink/50">
              Bassin {r.pool_length}m
            </span>
          )}
          <span
            className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
              r.source === "ffn" ? "bg-lagoon-light text-navy" : "bg-white text-ink/50"
            }`}
          >
            {r.source === "ffn" ? "FFN" : "Manuel"}
          </span>
        </p>
        <p className="text-sm text-ink/50">
          {r.competition_date ? formatDate(r.competition_date, { weekday: false }) : "Date inconnue"}
          {r.location ? ` · ${r.location}` : ""}
          {r.points ? ` · ${r.points} pts` : ""}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p className="font-display text-2xl text-navy">{msToSwimTime(r.time_ms)}</p>
        <form action={deleteResult}>
          <input type="hidden" name="id" value={r.id} />
          <button type="submit" className="text-xs font-semibold text-ink/30 hover:text-cardinal">
            ✕
          </button>
        </form>
      </div>
    </div>
  );
}

function ParticipantSection({ ps, results }) {
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
              Page officielle FFN →
            </a>
          )}
        </div>

        <form action={syncFfnResults}>
          <input type="hidden" name="participant_sport_id" value={ps.id} />
          <button
            type="submit"
            className="rounded-full bg-lagoon px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Synchroniser FFN
          </button>
        </form>
      </div>

      <div className="mt-3 rounded-lg bg-sand p-3 text-sm">
        <form action={updateFfnId} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="participant_sport_id" value={ps.id} />
          <label className="text-xs font-semibold text-ink/50">ID FFN</label>
          <input
            name="ffn_swimmer_id"
            defaultValue={ps.ffn_swimmer_id ?? ""}
            placeholder="ex. 4432567"
            className="w-40 rounded-lg border border-ink/15 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white hover:bg-navy-light"
          >
            Enregistrer
          </button>
        </form>

        {ps.last_ffn_sync_at && (
          <p className={`mt-2 text-xs ${ps.last_ffn_sync_error ? "text-cardinal-dark" : "text-ink/40"}`}>
            Dernière synchro : {formatDateTime(ps.last_ffn_sync_at)}
            {ps.last_ffn_sync_error ? ` — ${ps.last_ffn_sync_error}` : " — OK"}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        {results.length === 0 ? (
          <p className="text-sm text-ink/40">Aucune performance enregistrée pour l'instant.</p>
        ) : (
          results.map((r) => <ResultRow key={r.id} r={r} />)
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-navy">
          Ajouter une performance manuellement
        </summary>
        <form action={addResult} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="participant_sport_id" value={ps.id} />
          <input
            name="event_name" placeholder="Épreuve (ex. 100 Dos)" required
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm sm:col-span-2"
          />
          <input
            name="time_text" placeholder="Temps (ex. 1:14.30)" required
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
          />
          <select name="pool_length" className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm">
            <option value="25">Bassin 25m</option>
            <option value="50">Bassin 50m</option>
          </select>
          <input
            type="date" name="competition_date"
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
          />
          <input
            name="location" placeholder="Lieu"
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
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

export default async function NatationPage() {
  const supabase = createClient();

  const { data: sport } = await supabase
    .from("sports")
    .select("id, name")
    .eq("slug", "natation")
    .maybeSingle();

  const { data: assignments } = sport
    ? await supabase
        .from("participant_sports")
        .select("*, participants(id, first_name)")
        .eq("sport_id", sport.id)
    : { data: [] };

  const psIds = (assignments ?? []).map((a) => a.id);

  const { data: allResults } = psIds.length
    ? await supabase
        .from("swim_results")
        .select("*")
        .in("participant_sport_id", psIds)
        .order("distance_m", { ascending: true })
    : { data: [] };

  const resultsByPs = {};
  (allResults ?? []).forEach((r) => {
    if (!resultsByPs[r.participant_sport_id]) resultsByPs[r.participant_sport_id] = [];
    resultsByPs[r.participant_sport_id].push(r);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
          Natation
        </h1>
        <p className="mt-1 text-ink/60">
          Meilleures performances personnelles, synchronisables depuis la FFN.
        </p>
      </div>

      <p className="rounded-card bg-lagoon-light p-3 text-xs text-navy">
        La synchronisation récupère les Meilleures Performances Personnelles (MPP)
        publiées sur ffn.extranat.fr à partir de l'ID FFN de la nageuse. C'est une page
        publique mais pas une API officielle — si ça échoue, le message d'erreur sous
        chaque participante t'indique quoi faire.
      </p>

      {(!assignments || assignments.length === 0) ? (
        <div className="rounded-card bg-white p-8 text-center shadow-sm">
          <p className="text-ink/60">
            Personne n'est encore associé à la natation. Configure ça dans Paramètres.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((ps) => (
            <ParticipantSection key={ps.id} ps={ps} results={resultsByPs[ps.id] ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}
