import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, msToSwimTime, computeCurrentSeasonYear } from "@/lib/utils";
import SyncButton from "@/components/SyncButton";
import { syncClubCompetitions, toggleSwimmerFlag } from "./actions";

export const dynamic = "force-dynamic";
// La synchro FFN (appelée via l'action syncClubCompetitions depuis cette
// page) peut enchaîner plusieurs appels réseau : on demande explicitement
// plus de temps qu'une requête classique (le max réel dépend du plan
// Vercel, ceci est une demande, pas une garantie).
export const maxDuration = 60;

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
    <div className="space-y-0.5 bg-navy/5 px-4 py-2">
      {sorted.map((r, i) => (
        <div
          key={r.id}
          className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
            r.swimmer_id === highlightSwimmerId
              ? "bg-cardinal-light font-semibold text-cardinal-dark"
              : r.swimmers?.is_flagged
              ? "bg-lagoon-light text-navy"
              : "text-ink/60"
          }`}
        >
          <span>
            {i + 1}. {r.swimmers?.full_name}
            {r.swimmers?.club ? ` · ${r.swimmers.club}` : ""}
          </span>
          <span className="font-display">{r.time_ms != null ? msToSwimTime(r.time_ms) : r.time_label}</span>
        </div>
      ))}
    </div>
  );
}

// Tableau dense façon "fiche FFN" : bandeau bleu par bassin, lignes
// compactes une par épreuve, alternées, avec une étoile dépliable si
// d'autres nageuses ont couru la même épreuve dans la même compétition.
function ResultsTable({ title, rows, meetRowsByKey, swimmerId }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-card bg-white p-6 text-sm text-ink/50 shadow-sm">
        Aucune performance enregistrée pour l'instant — lance une synchro ci-dessus.
      </p>
    );
  }

  const byPool = {};
  rows.forEach((r) => {
    const pool = r.swim_competitions?.pool_length ?? r.pool_length ?? "?";
    if (!byPool[pool]) byPool[pool] = [];
    byPool[pool].push(r);
  });

  return (
    <div className="space-y-4">
      {Object.entries(byPool).map(([pool, poolRows]) => (
        <div key={pool} className="overflow-hidden rounded-card shadow-sm">
          <div className="bg-navy px-4 py-2 text-white">
            <p className="font-display text-sm uppercase tracking-tight">{title}</p>
            <p className="text-xs opacity-70">Bassin : {pool} mètres</p>
          </div>
          <div>
            {poolRows.map((r, i) => {
              const key = `${r.competition_id}-${r.event_name}-${r.gender}`;
              const meetRows = meetRowsByKey[key];
              const expandable = meetRows && meetRows.length > 1;

              const rowContent = (
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                  <span className="w-28 shrink-0 font-semibold text-ink">{r.event_name}</span>
                  <span className="w-20 shrink-0 font-display text-lg text-navy">
                    {r.time_ms != null ? msToSwimTime(r.time_ms) : r.time_label ?? "—"}
                  </span>
                  <span className="hidden flex-1 truncate text-xs text-ink/50 sm:block">
                    {r.swim_competitions?.city ?? r.swim_competitions?.name ?? ""}
                  </span>
                  <span className="shrink-0 text-xs text-ink/50">
                    {r.swim_competitions?.competition_date
                      ? formatDate(r.swim_competitions.competition_date, { weekday: false })
                      : ""}
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs italic text-lagoon">
                    {r.points ? `${r.points}p` : ""}
                  </span>
                  {expandable ? (
                    <span className="shrink-0 text-xs font-semibold text-cardinal">
                      ⭐ {meetRows.length}
                    </span>
                  ) : (
                    <span className="w-8 shrink-0" />
                  )}
                </summary>
              );

              return expandable ? (
                <details
                  key={r.id}
                  className={i % 2 === 0 ? "bg-lagoon-light/40" : "bg-white"}
                >
                  {rowContent}
                  <MeetDetails rows={meetRows} highlightSwimmerId={swimmerId} />
                </details>
              ) : (
                <div key={r.id} className={i % 2 === 0 ? "bg-lagoon-light/40" : "bg-white"}>
                  {rowContent}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PerformancesTab({ swimmerId, results, view, meetRowsByKey }) {
  if (!swimmerId) {
    return (
      <p className="rounded-card bg-white p-8 text-center text-ink/60 shadow-sm">
        Pas encore de nageuse à afficher — lance une synchro, ou va dans l'onglet
        Participants pour en suivre une.
      </p>
    );
  }

  let rows = results;
  let title = "Performances";
  if (view === "mpp") {
    title = "Meilleures Performances Personnelles (MPP)";
    const best = {};
    for (const r of results) {
      const key = `${r.distance_m}-${r.stroke}-${r.swim_competitions?.pool_length ?? r.pool_length}`;
      if (r.time_ms == null) continue;
      if (!best[key] || r.time_ms < best[key].time_ms) best[key] = r;
    }
    rows = Object.values(best).sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
  }

  return (
    <ResultsTable title={title} rows={rows} meetRowsByKey={meetRowsByKey} swimmerId={swimmerId} />
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
  let swimmerOptions = [];
  let selectedSwimmerId = null;

  if (tab === "performances") {
    // Nageuse par défaut = celle liée à une participante de Paramètres.
    const defaultPs = (assignments ?? []).find((a) => a.participant_id);
    let defaultSwimmer = null;
    if (defaultPs?.participant_id) {
      const { data } = await supabase
        .from("swimmers")
        .select("*")
        .eq("participant_id", defaultPs.participant_id)
        .maybeSingle();
      defaultSwimmer = data;
    }

    const { data: followedSwimmers } = await supabase
      .from("swimmers")
      .select("*")
      .eq("is_flagged", true)
      .order("full_name");

    if (defaultSwimmer) {
      swimmerOptions.push({
        id: defaultSwimmer.id,
        label: defaultPs.participants?.first_name ?? defaultSwimmer.full_name,
      });
    }
    (followedSwimmers ?? []).forEach((s) => {
      if (!swimmerOptions.find((o) => o.id === s.id)) {
        swimmerOptions.push({ id: s.id, label: s.full_name });
      }
    });

    selectedSwimmerId =
      searchParams?.swimmer || defaultSwimmer?.id || swimmerOptions[0]?.id || null;

    let results = [];
    const meetRowsByKey = {};

    if (selectedSwimmerId) {
      const { data: resultRows } = await supabase
        .from("swim_results")
        .select("*, swim_competitions(name, city, competition_date, pool_length)")
        .eq("swimmer_id", selectedSwimmerId)
        .order("competition_date", { referencedTable: "swim_competitions", ascending: false });
      results = resultRows ?? [];

      const competitionIds = [...new Set(results.map((r) => r.competition_id))];
      if (competitionIds.length > 0) {
        const { data: allMeetRows } = await supabase
          .from("swim_results")
          .select("*, swimmers(full_name, club, is_flagged)")
          .in("competition_id", competitionIds);

        (allMeetRows ?? []).forEach((row) => {
          const key = `${row.competition_id}-${row.event_name}-${row.gender}`;
          if (!meetRowsByKey[key]) meetRowsByKey[key] = [];
          meetRowsByKey[key].push(row);
        });
      }
    }

    performancesContent = (
      <PerformancesTab
        swimmerId={selectedSwimmerId}
        results={results}
        view={view}
        meetRowsByKey={meetRowsByKey}
      />
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
        <>
          {swimmerOptions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {swimmerOptions.map((opt) => (
                <Link
                  key={opt.id}
                  href={`/natation?tab=performances&view=${view}&swimmer=${opt.id}`}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    opt.id === selectedSwimmerId
                      ? "bg-cardinal text-white"
                      : "bg-white text-ink/50 hover:text-ink"
                  }`}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Link
              href={`/natation?tab=performances&view=mpp&swimmer=${selectedSwimmerId ?? ""}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                view === "mpp" ? "bg-lagoon text-white" : "bg-white text-ink/50"
              }`}
            >
              MPP
            </Link>
            <Link
              href={`/natation?tab=performances&view=all&swimmer=${selectedSwimmerId ?? ""}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                view === "all" ? "bg-lagoon text-white" : "bg-white text-ink/50"
              }`}
            >
              Performances
            </Link>
          </div>
        </>
      )}

      {tab === "performances" ? performancesContent : participantsContent}
    </div>
  );
}
