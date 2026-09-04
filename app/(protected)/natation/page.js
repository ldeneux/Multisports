import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, msToSwimTime, computeCurrentSeasonYear } from "@/lib/utils";
import SyncButton from "@/components/SyncButton";
import { SwimRadarChart, SwimPercentileTrendChart } from "@/components/SwimCharts";
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

const GENDER_LABELS = { F: "Dames", M: "Messieurs", X: "Mixtes" };

// Classement complet des ÉQUIPES d'une course de relais (garçons + filles
// mélangés si le relais est mixte), triées par temps cumulé, avec pour
// chaque relayeur son propre temps ET le temps cumulé de l'équipe à ce
// stade.
function RelayFieldDetails({ teams, highlightSwimmerId }) {
  return (
    <div className="space-y-2 bg-navy/5 px-4 py-2">
      {teams.map((team, i) => (
        <div key={team.id} className="rounded-lg bg-white p-2 text-xs shadow-sm">
          <div className="flex items-center justify-between font-semibold text-ink">
            <span>
              {i + 1}. {team.club ?? "Club inconnu"}
            </span>
            <span className="font-display text-sm text-navy">
              {team.team_time_ms != null ? msToSwimTime(team.team_time_ms) : "—"}
              {team.points ? ` · ${team.points}p` : ""}
            </span>
          </div>
          <div className="mt-1 space-y-0.5">
            {(team.swim_relay_legs ?? [])
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((leg) => (
                <div
                  key={leg.position}
                  className={`flex items-center justify-between px-1 ${
                    leg.swimmers && highlightSwimmerId && leg.swimmer_id === highlightSwimmerId
                      ? "font-semibold text-cardinal-dark"
                      : "text-ink/60"
                  }`}
                >
                  <span>
                    {leg.position}. {leg.swimmers?.full_name ?? "?"}
                  </span>
                  <span className="flex gap-3 font-display">
                    <span>{leg.leg_time_ms != null ? msToSwimTime(leg.leg_time_ms) : "—"}</span>
                    <span className="text-ink/40">
                      ({leg.cumulative_time_ms != null ? msToSwimTime(leg.cumulative_time_ms) : "—"})
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Une ligne compacte pour une performance (utilisée par les deux vues).
function ResultRow({ r, showEventName, meetRowsByKey, relayFieldByKey, swimmerId, striped }) {
  const key = `${r.competition_id}-${r.event_name}-${r.gender}-${r.relay_ffn_result_id ?? "solo"}`;
  const relayField = relayFieldByKey[key];
  const meetRows = relayField ? null : meetRowsByKey[key];
  const expandable = !!relayField || !!meetRows;
  const count = relayField ? relayField.teams.length : meetRows?.length ?? 0;

  const cityLabel = relayField
    ? `${r.swim_competitions?.city ?? r.swim_competitions?.name ?? ""} (${relayField.eventName}${
        r.gender ? ` ${GENDER_LABELS[r.gender] ?? ""}` : ""
      })`
    : r.swim_competitions?.city ?? r.swim_competitions?.name ?? "";

  const rowContent = (
    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      {showEventName && <span className="w-28 shrink-0 font-semibold text-ink">{r.event_name}</span>}
      <span className="w-24 shrink-0 text-right font-display text-lg text-navy">
        {r.time_ms != null ? msToSwimTime(r.time_ms) : r.time_label ?? "—"}
      </span>
      <span className="hidden flex-1 truncate text-xs text-ink/50 sm:block">{cityLabel}</span>
      <span className="shrink-0 text-xs text-ink/50">
        {r.swim_competitions?.competition_date
          ? formatDate(r.swim_competitions.competition_date, { weekday: false })
          : ""}
      </span>
      <span className="w-12 shrink-0 text-right text-xs italic text-lagoon">
        {r.points ? `${r.points}p` : ""}
      </span>
      {expandable ? (
        <span className="shrink-0 text-xs font-semibold text-cardinal">⭐ {count}</span>
      ) : (
        <span className="w-8 shrink-0" />
      )}
    </summary>
  );

  const bg = striped ? "bg-lagoon-light/40" : "bg-white";

  if (!expandable) {
    return <div className={bg}>{rowContent}</div>;
  }

  return (
    <details className={bg}>
      {rowContent}
      {relayField ? (
        <RelayFieldDetails teams={relayField.teams} highlightSwimmerId={swimmerId} />
      ) : (
        <MeetDetails rows={meetRows} highlightSwimmerId={swimmerId} />
      )}
    </details>
  );
}

// Vue MPP : une ligne par épreuve, groupée par bassin.
function MppTable({ rows, meetRowsByKey, relayFieldByKey, swimmerId }) {
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
            <p className="font-display text-sm uppercase tracking-tight">
              Meilleures Performances Personnelles (MPP)
            </p>
            <p className="text-xs opacity-70">Bassin : {pool} mètres</p>
          </div>
          <div>
            {poolRows.map((r, i) => (
              <ResultRow
                key={r.id}
                r={r}
                showEventName
                meetRowsByKey={meetRowsByKey}
                relayFieldByKey={relayFieldByKey}
                swimmerId={swimmerId}
                striped={i % 2 === 0}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Vue Performances (historique complet) : groupée par bassin PUIS par
// épreuve, chaque groupe d'épreuve trié chronologiquement — pour suivre la
// progression au fil des compétitions plutôt qu'une liste en vrac.
function PerformancesByEvent({ results, meetRowsByKey, relayFieldByKey, swimmerId }) {
  const byPool = {};
  results.forEach((r) => {
    const pool = r.swim_competitions?.pool_length ?? r.pool_length ?? "?";
    if (!byPool[pool]) byPool[pool] = {};
    if (!byPool[pool][r.event_name]) byPool[pool][r.event_name] = [];
    byPool[pool][r.event_name].push(r);
  });

  return (
    <div className="space-y-4">
      {Object.entries(byPool).map(([pool, events]) => (
        <div key={pool} className="overflow-hidden rounded-card shadow-sm">
          <div className="bg-navy px-4 py-2 text-white">
            <p className="font-display text-sm uppercase tracking-tight">Performances</p>
            <p className="text-xs opacity-70">Bassin : {pool} mètres</p>
          </div>
          <div>
            {Object.entries(events)
              .sort((a, b) => {
                const da = a[1][0]?.distance_m ?? 0;
                const db = b[1][0]?.distance_m ?? 0;
                return da - db || a[0].localeCompare(b[0]);
              })
              .map(([eventName, rows]) => {
                const sortedRows = [...rows].sort((a, b) =>
                  (a.swim_competitions?.competition_date ?? "").localeCompare(
                    b.swim_competitions?.competition_date ?? ""
                  )
                );
                return (
                  <div key={eventName}>
                    <p className="bg-sand px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink/60">
                      {eventName}
                    </p>
                    {sortedRows.map((r, i) => (
                      <ResultRow
                        key={r.id}
                        r={r}
                        showEventName={false}
                        meetRowsByKey={meetRowsByKey}
                        relayFieldByKey={relayFieldByKey}
                        swimmerId={swimmerId}
                        striped={i % 2 === 0}
                      />
                    ))}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PerformancesTab({ swimmerId, results, mppRows, view, meetRowsByKey, relayFieldByKey }) {
  if (!swimmerId) {
    return (
      <p className="rounded-card bg-white p-8 text-center text-ink/60 shadow-sm">
        Pas encore de nageuse à afficher — lance une synchro, ou va dans l'onglet
        Participants pour en suivre une.
      </p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="rounded-card bg-white p-6 text-sm text-ink/50 shadow-sm">
        Aucune performance enregistrée pour l'instant — lance une synchro ci-dessus.
      </p>
    );
  }

  return view === "mpp" ? (
    <MppTable
      rows={mppRows}
      meetRowsByKey={meetRowsByKey}
      relayFieldByKey={relayFieldByKey}
      swimmerId={swimmerId}
    />
  ) : (
    <PerformancesByEvent
      results={results}
      meetRowsByKey={meetRowsByKey}
      relayFieldByKey={relayFieldByKey}
      swimmerId={swimmerId}
    />
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

// Score de 0 à 100 de `timeMs` au sein du champ [best, worst] (best = temps
// le plus rapide connu sur l'épreuve, worst = le plus lent). Volontairement
// une interpolation linéaire sur le TEMPS réel (pas sur le rang / la
// position dans la liste) : deux nageuses séparées de 3 secondes dans un
// groupe où tout le monde se tient en 0.2s doivent avoir un écart de score
// nettement plus grand que deux nageuses qui se suivent à 0.1s d'intervalle
// — un simple classement (1er, 2e, 3e...) gommerait cet écart.
function percentileFromField(timeMs, best, worst) {
  if (timeMs == null || best == null || worst == null) return null;
  if (worst === best) return 100;
  const score = ((worst - timeMs) / (worst - best)) * 100;
  return Math.max(0, Math.min(100, score));
}

// Pour une épreuve (event_name + gender + pool_length) donnée, va chercher
// en base le meilleur temps de CHAQUE nageuse déjà synchronisée sur cette
// épreuve, pour obtenir le temps le plus rapide et le plus lent du champ.
async function fetchEventField(supabase, { eventName, gender, poolLength }) {
  const { data } = await supabase
    .from("swim_results")
    .select("swimmer_id, time_ms")
    .eq("event_name", eventName)
    .eq("gender", gender)
    .eq("pool_length", poolLength)
    .not("time_ms", "is", null)
    .limit(1000);

  const bestBySwimmer = new Map();
  for (const row of data ?? []) {
    const current = bestBySwimmer.get(row.swimmer_id);
    if (current == null || row.time_ms < current) {
      bestBySwimmer.set(row.swimmer_id, row.time_ms);
    }
  }
  const times = [...bestBySwimmer.values()];
  if (times.length === 0) return null;
  return { best: Math.min(...times), worst: Math.max(...times), fieldSize: times.length };
}

// Construit les données du radar (une épreuve = un axe, score = percentile
// de la MPP de la nageuse) et de la courbe d'évolution (une épreuve = une
// série, un point par compétition nagée sur cette épreuve).
async function buildGraphData(supabase, mppRows, results) {
  const radarData = [];
  const trendSeries = [];
  const fieldCache = new Map();

  for (const mpp of mppRows) {
    if (mpp.time_ms == null || !mpp.event_name) continue;
    const poolLength = mpp.swim_competitions?.pool_length ?? mpp.pool_length;
    const cacheKey = `${mpp.event_name}-${mpp.gender}-${poolLength}`;

    let field = fieldCache.get(cacheKey);
    if (field === undefined) {
      field = await fetchEventField(supabase, { eventName: mpp.event_name, gender: mpp.gender, poolLength });
      fieldCache.set(cacheKey, field);
    }
    if (!field) continue;

    const percentile = percentileFromField(mpp.time_ms, field.best, field.worst);
    if (percentile == null) continue;

    radarData.push({ label: mpp.event_name, percentile, fieldSize: field.fieldSize });

    const eventResults = results.filter((r) => {
      const rPoolLength = r.swim_competitions?.pool_length ?? r.pool_length;
      return r.event_name === mpp.event_name && r.gender === mpp.gender && rPoolLength === poolLength && r.time_ms != null;
    });
    const points = eventResults
      .filter((r) => r.swim_competitions?.competition_date)
      .map((r) => ({
        date: r.swim_competitions.competition_date,
        percentile: percentileFromField(r.time_ms, field.best, field.worst),
      }))
      .filter((p) => p.percentile != null);

    if (points.length > 0) {
      trendSeries.push({ label: mpp.event_name, points });
    }
  }

  return { radarData, trendSeries };
}

function GraphiqueTab({ swimmerLabel, radarData, trendSeries }) {
  if (!radarData || radarData.length === 0) {
    return (
      <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
        Pas encore assez de données synchronisées pour {swimmerLabel ?? "cette nageuse"} — reviens après
        quelques compétitions de plus.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-white p-5 shadow-sm">
        <p className="font-display text-sm uppercase tracking-tight text-navy">
          Profil par épreuve{swimmerLabel ? ` — ${swimmerLabel}` : ""}
        </p>
        <p className="mt-1 text-xs text-ink/50">
          100 = meilleur temps connu sur l'épreuve, 0 = le plus lent. L'écart entre deux épreuves reflète
          l'écart de temps réel dans le champ, pas juste le classement.
        </p>
        <SwimRadarChart data={radarData} />
      </div>

      {trendSeries.length > 0 && (
        <div className="rounded-card bg-white p-5 shadow-sm">
          <p className="font-display text-sm uppercase tracking-tight text-navy">Évolution dans la saison</p>
          <p className="mt-1 text-xs text-ink/50">
            Percentile obtenu à chaque compétition, épreuve par épreuve.
          </p>
          <div className="mt-3">
            <SwimPercentileTrendChart series={trendSeries} />
          </div>
        </div>
      )}
    </div>
  );
}

export default async function NatationPage({ searchParams }) {
  const supabase = createClient();

  const tab = searchParams?.tab === "participants" ? "participants" : "performances";
  const view =
    searchParams?.view === "all" ? "all" : searchParams?.view === "graph" ? "graph" : "mpp";

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
    let mppRows = [];
    const meetRowsByKey = {};
    const relayFieldByKey = {};

    if (selectedSwimmerId) {
      const { data: resultRows } = await supabase
        .from("swim_results")
        .select("*, swim_competitions(name, city, competition_date, pool_length)")
        .eq("swimmer_id", selectedSwimmerId)
        .order("competition_date", { referencedTable: "swim_competitions", ascending: true });
      results = resultRows ?? [];

      const best = {};
      for (const r of results) {
        const key = `${r.distance_m}-${r.stroke}-${r.swim_competitions?.pool_length ?? r.pool_length}`;
        if (r.time_ms == null) continue;
        const current = best[key];
        if (!current || r.time_ms < current.time_ms) {
          best[key] = r;
        } else if (r.time_ms === current.time_ms && current.points == null && r.points != null) {
          // Deux lignes à temps identique (ex. doublon issu d'anciennes
          // synchros) : on garde celle qui a des points renseignés.
          best[key] = r;
        }
      }
      mppRows = Object.values(best).sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));

      if (view === "graph") {
        const { radarData, trendSeries } = await buildGraphData(supabase, mppRows, results);
        performancesContent = (
          <GraphiqueTab swimmerLabel={swimmerOptions.find((o) => o.id === selectedSwimmerId)?.label} radarData={radarData} trendSeries={trendSeries} />
        );
      } else {
        // Pour chaque ligne réellement affichée (pas toutes ses performances,
        // juste celles de la vue courante), on va chercher le classement
        // complet — soit individuel (une compétition + une épreuve + un genre
        // = ~150 lignes max), soit, pour les performances issues d'un 1er
        // relayeur, le classement complet des ÉQUIPES de la course de relais.
        // Requêtes ciblées plutôt qu'une grosse requête globale qui dépassait
        // la limite de 1000 lignes de Supabase et tronquait silencieusement
        // les résultats.
        const rowsToExpand = view === "mpp" ? mppRows : results;
        const seenKeys = new Set();
        for (const r of rowsToExpand) {
          const key = `${r.competition_id}-${r.event_name}-${r.gender}-${r.relay_ffn_result_id ?? "solo"}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          if (r.relay_ffn_result_id) {
            const { data: thisTeam } = await supabase
              .from("swim_relay_teams")
              .select("*")
              .eq("competition_id", r.competition_id)
              .eq("ffn_result_id", r.relay_ffn_result_id)
              .maybeSingle();

            if (thisTeam) {
              const { data: allTeams } = await supabase
                .from("swim_relay_teams")
                .select(
                  "*, swim_relay_legs(position, swimmer_id, leg_time_ms, cumulative_time_ms, swimmers(full_name, club, gender))"
                )
                .eq("competition_id", r.competition_id)
                .eq("event_name", thisTeam.event_name)
                .eq("gender", thisTeam.gender)
                .order("team_time_ms", { ascending: true })
                .limit(100);

              if (allTeams && allTeams.length > 0) {
                relayFieldByKey[key] = { teams: allTeams, eventName: thisTeam.event_name };
              }
            }
            continue;
          }

          const { data: meetRows } = await supabase
            .from("swim_results")
            .select("*, swimmers(full_name, club, is_flagged)")
            .eq("competition_id", r.competition_id)
            .eq("event_name", r.event_name)
            .eq("gender", r.gender)
            .limit(300);

          if (meetRows && meetRows.length > 1) {
            meetRowsByKey[key] = meetRows;
          }
        }

        performancesContent = (
          <PerformancesTab
            swimmerId={selectedSwimmerId}
            results={results}
            mppRows={mppRows}
            view={view}
            meetRowsByKey={meetRowsByKey}
            relayFieldByKey={relayFieldByKey}
          />
        );
      }
    }
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
            <Link
              href={`/natation?tab=performances&view=graph&swimmer=${selectedSwimmerId ?? ""}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                view === "graph" ? "bg-lagoon text-white" : "bg-white text-ink/50"
              }`}
            >
              Graphique
            </Link>
          </div>
        </>
      )}

      {tab === "performances" ? performancesContent : participantsContent}
    </div>
  );
}
