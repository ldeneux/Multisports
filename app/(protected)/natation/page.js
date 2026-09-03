import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, msToSwimTime, computeCurrentSeasonYear } from "@/lib/utils";
import SyncButton from "@/components/SyncButton";
import {
  syncClubCompetitions,
  toggleSwimmerFlag,
} from "./actions";

export const dynamic = "force-dynamic";

function SyncCard({ ps }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg uppercase tracking-tight text-navy">
            Synchro club — {ps.participants?.first_name ?? "Natation"}
          </p>
          <p className="text-sm text-ink/50">
            Récupère toutes les compétitions départementales du club (et tous les
            nageurs qui y ont participé) pour une saison donnée.
          </p>
        </div>
      </div>

      <form action={syncClubCompetitions} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="participant_sport_id" value={ps.id} />
        <label className="text-xs font-semibold text-ink/50">
          ID club FFN
          <input
            name="ffn_club_id"
            defaultValue={ps.ffn_club_id ?? ""}
            placeholder="ex. 836"
            className="mt-1 w-28 rounded-lg border border-ink/15 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-ink/50">
          Saison (année de fin)
          <input
            name="season_year"
            defaultValue={computeCurrentSeasonYear()}
            className="mt-1 w-24 rounded-lg border border-ink/15 px-2 py-1 text-sm"
          />
        </label>
        <SyncButton
          pendingLabel="Synchronisation..."
          className="rounded-full bg-lagoon px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          Synchroniser
        </SyncButton>
      </form>

      {ps.last_ffn_sync_at && (
        <p className={`mt-2 text-xs ${ps.last_ffn_sync_error ? "text-cardinal-dark" : "text-ink/40"}`}>
          Dernière synchro : {formatDateTime(ps.last_ffn_sync_at)} —{" "}
          {ps.last_ffn_sync_error ?? ps.last_ffn_sync_summary ?? "OK"}
        </p>
      )}
    </div>
  );
}

function MeetDetails({ rows, highlightSwimmerId }) {
  const sorted = [...rows].sort((a, b) => {
    if (a.time_ms == null) return 1;
    if (b.time_ms == null) return -1;
    return a.time_ms - b.time_ms;
  });

  return (
    <div className="mt-2 space-y-1 rounded-lg bg-white p-2">
      {sorted.map((r) => (
        <div
          key={r.id}
          className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
            r.swimmer_id === highlightSwimmerId
              ? "bg-cardinal-light font-semibold text-cardinal-dark"
              : r.swimmers?.is_flagged
              ? "bg-lagoon-light text-navy"
              : "text-ink/70"
          }`}
        >
          <span>
            {r.rank} {r.swimmers?.full_name}
            {r.swimmers?.club ? ` · ${r.swimmers.club}` : ""}
          </span>
          <span className="font-display">{r.time_ms != null ? msToSwimTime(r.time_ms) : r.time_label}</span>
        </div>
      ))}
    </div>
  );
}

function PerformancesTab({ swimmer, results, view, meetRowsByKey }) {
  if (!swimmer) {
    return (
      <p className="rounded-card bg-white p-8 text-center text-ink/60 shadow-sm">
        Pas encore de nageuse liée à un profil — lance une synchro, puis va dans
        l'onglet Participants pour lier une nageuse à une des filles.
      </p>
    );
  }

  let rows = results;
  if (view === "mpp") {
    const best = {};
    for (const r of results) {
      const key = `${r.distance_m}-${r.stroke}`;
      if (r.time_ms == null) continue;
      if (!best[key] || r.time_ms < best[key].time_ms) best[key] = r;
    }
    rows = Object.values(best).sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-card bg-white p-6 text-sm text-ink/50 shadow-sm">
          Aucune performance enregistrée pour l'instant — lance une synchro ci-dessus.
        </p>
      ) : (
        rows.map((r) => {
          const key = `${r.competition_id}-${r.event_name}`;
          const meetRows = meetRowsByKey[key];
          return (
            <div key={r.id} className="rounded-card bg-sand p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-ink">
                    {r.event_name}
                    {r.swim_competitions?.pool_length && (
                      <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink/50">
                        Bassin {r.swim_competitions.pool_length}m
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink/50">
                    {r.swim_competitions?.competition_date
                      ? formatDate(r.swim_competitions.competition_date, { weekday: false })
                      : "Date inconnue"}
                    {r.swim_competitions?.name ? ` · ${r.swim_competitions.name}` : ""}
                    {r.points ? ` · ${r.points} pts` : ""}
                  </p>
                </div>
                <p className="font-display text-2xl text-navy">
                  {r.time_ms != null ? msToSwimTime(r.time_ms) : r.time_label ?? "—"}
                </p>
              </div>

              {meetRows && meetRows.length > 1 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-cardinal">
                    ⭐ Voir les {meetRows.length} résultats de cette épreuve
                  </summary>
                  <MeetDetails rows={meetRows} highlightSwimmerId={swimmer.id} />
                </details>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function ParticipantsTab({ searchResults, followed, hasQuery, query }) {
  return (
    <div className="space-y-6">
      <form className="flex flex-wrap gap-2 rounded-card bg-white p-3 shadow-sm">
        <input type="hidden" name="tab" value="participants" />
        <input
          name="q"
          defaultValue={query}
          placeholder="Chercher une nageuse par nom ou club..."
          className="min-w-[240px] flex-1 rounded-lg border border-ink/15 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-full bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy-light"
        >
          Rechercher
        </button>
      </form>

      {hasQuery && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">
            Résultats de recherche
          </h3>
          {searchResults.length === 0 ? (
            <p className="rounded-card bg-white p-4 text-sm text-ink/50 shadow-sm">
              Aucune nageuse trouvée pour "{query}".
            </p>
          ) : (
            <div className="space-y-1.5">
              {searchResults.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-card bg-white p-3 shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-ink">{s.full_name}</p>
                    <p className="text-sm text-ink/50">
                      {s.club ?? "Club inconnu"}
                      {s.birth_year ? ` · ${s.birth_year}` : ""}
                    </p>
                  </div>
                  {s.is_flagged ? (
                    <span className="rounded-full bg-cardinal-light px-3 py-1 text-xs font-semibold text-cardinal-dark">
                      ⭐ Déjà suivie
                    </span>
                  ) : (
                    <form action={toggleSwimmerFlag}>
                      <input type="hidden" name="swimmer_id" value={s.id} />
                      <input type="hidden" name="currently_flagged" value="false" />
                      <button
                        type="submit"
                        className="rounded-full bg-lagoon px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                      >
                        + Suivre
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">
          Nageuses suivies ({followed.length})
        </h3>
        {followed.length === 0 ? (
          <p className="rounded-card bg-white p-4 text-sm text-ink/50 shadow-sm">
            Personne à suivre pour l'instant — cherche une nageuse ci-dessus pour l'ajouter.
          </p>
        ) : (
          <div className="space-y-1.5">
            {followed.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-card bg-white p-3 shadow-sm"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {s.full_name}
                    {s.participant_id && (
                      <span className="ml-2 rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-white">
                        Une de mes filles
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink/50">
                    {s.club ?? "Club inconnu"}
                    {s.birth_year ? ` · ${s.birth_year}` : ""}
                  </p>
                </div>
                <form action={toggleSwimmerFlag}>
                  <input type="hidden" name="swimmer_id" value={s.id} />
                  <input type="hidden" name="currently_flagged" value="true" />
                  <button
                    type="submit"
                    className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-ink/50 hover:text-cardinal"
                  >
                    Retirer
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default async function NatationPage({ searchParams }) {
  const supabase = createClient();

  const tab = searchParams?.tab === "participants" ? "participants" : "performances";
  const view = searchParams?.view === "all" ? "all" : "mpp";

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

  let performancesContent = null;
  let participantsContent = null;

  if (tab === "performances") {
    const selectedPsId = searchParams?.participant;
    const selectedPs =
      (assignments ?? []).find((a) => a.id === selectedPsId) ?? (assignments ?? [])[0];

    let swimmer = null;
    let results = [];
    const meetRowsByKey = {};

    if (selectedPs?.participant_id) {
      const { data: swimmerRow } = await supabase
        .from("swimmers")
        .select("*")
        .eq("participant_id", selectedPs.participant_id)
        .maybeSingle();
      swimmer = swimmerRow;

      if (swimmer) {
        const { data: resultRows } = await supabase
          .from("swim_results")
          .select("*, swim_competitions(name, city, competition_date, pool_length)")
          .eq("swimmer_id", swimmer.id)
          .order("competition_date", { referencedTable: "swim_competitions", ascending: false });
        results = resultRows ?? [];

        const competitionIds = [...new Set(results.map((r) => r.competition_id))];
        if (competitionIds.length > 0) {
          const { data: allMeetRows } = await supabase
            .from("swim_results")
            .select("*, swimmers(full_name, club, is_flagged)")
            .in("competition_id", competitionIds);

          (allMeetRows ?? []).forEach((row) => {
            const key = `${row.competition_id}-${row.event_name}`;
            if (!meetRowsByKey[key]) meetRowsByKey[key] = [];
            meetRowsByKey[key].push(row);
          });
        }
      }
    }

    performancesContent = (
      <PerformancesTab swimmer={swimmer} results={results} view={view} meetRowsByKey={meetRowsByKey} />
    );
  } else {
    const q = (searchParams?.q ?? "").trim();
    const hasQuery = q.length > 0;

    let searchResults = [];
    if (hasQuery) {
      const { data } = await supabase
        .from("swimmers")
        .select("*")
        .or(`full_name.ilike.%${q}%,club.ilike.%${q}%`)
        .order("full_name")
        .limit(30);
      searchResults = data ?? [];
    }

    const { data: followedData } = await supabase
      .from("swimmers")
      .select("*")
      .eq("is_flagged", true)
      .order("full_name");

    participantsContent = (
      <ParticipantsTab
        searchResults={searchResults}
        followed={followedData ?? []}
        hasQuery={hasQuery}
        query={q}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
          Natation
        </h1>
        <p className="mt-1 text-ink/60">
          Compétitions départementales du club, synchronisées depuis la FFN.
        </p>
      </div>

      <p className="rounded-card bg-lagoon-light p-3 text-xs text-navy">
        La synchro utilise des pages publiques de la FFN, pas une API officielle — si
        ça échoue, le message sous le bouton Synchroniser t'indique quoi faire.
      </p>

      <div className="space-y-3">
        {(assignments ?? []).map((ps) => (
          <SyncCard key={ps.id} ps={ps} />
        ))}
      </div>

      <div className="flex gap-2">
        <Link
          href="/natation?tab=performances"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            tab === "performances" ? "bg-navy text-white" : "bg-white text-ink/60"
          }`}
        >
          Performances
        </Link>
        <Link
          href="/natation?tab=participants"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            tab === "participants" ? "bg-navy text-white" : "bg-white text-ink/60"
          }`}
        >
          Participants
        </Link>
      </div>

      {tab === "performances" && (
        <div className="flex gap-2">
          <Link
            href="/natation?tab=performances&view=mpp"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              view === "mpp" ? "bg-lagoon text-white" : "bg-white text-ink/50"
            }`}
          >
            MPP
          </Link>
          <Link
            href="/natation?tab=performances&view=all"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              view === "all" ? "bg-lagoon text-white" : "bg-white text-ink/50"
            }`}
          >
            Performances
          </Link>
        </div>
      )}

      {tab === "performances" ? performancesContent : participantsContent}
    </div>
  );
}
