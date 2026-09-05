import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, ffbbAssetUrl } from "@/lib/utils";
import SyncButton from "@/components/SyncButton";
import {
  addMatch,
  recordScore,
  deleteMatch,
  updateFfbbId,
  syncFfbbMatches,
} from "./actions";

export const dynamic = "force-dynamic";

function Crest({ assetId, alt }) {
  const url = ffbbAssetUrl(assetId, { width: 64 });
  if (!url) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand text-xs font-bold text-ink/30">
        ?
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="h-8 w-8 shrink-0 rounded-full object-contain" />;
}

function SyncCard({ ps }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg uppercase tracking-tight text-navy">
            Synchro FFBB — {ps.participants?.first_name ?? "Basket"}
          </p>
          <p className="text-sm text-ink/50">
            Récupère le calendrier, les résultats et le classement de la poule.
          </p>
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
          <label className="text-xs font-semibold text-ink/50">ID FFBB (engagement)</label>
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
    </div>
  );
}

// Trie les journées numériquement quand c'est possible ("1", "2"...),
// sinon en ordre alphabétique (FFBB utilise parfois des libellés comme
// "Barrage" ou "Coupe" au lieu d'un numéro).
function sortJournees(values) {
  return [...values].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

function buildJourneeOptions(matches) {
  const values = new Set();
  matches.forEach((m) => {
    if (m.numero_journee) values.add(m.numero_journee);
  });
  return sortJournees([...values]);
}

// Journée par défaut à l'ouverture : celle du prochain match à venir, ou à
// défaut la dernière journée jouée — pour tomber directement sur "ce qui
// vient de se passer / ce qui arrive" plutôt que sur la journée 1.
function defaultJournee(matches, journeeOptions) {
  if (journeeOptions.length === 0) return null;
  const upcoming = matches
    .filter((m) => m.status === "a_venir" && m.numero_journee)
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
  if (upcoming[0]?.numero_journee) return upcoming[0].numero_journee;

  const played = matches
    .filter((m) => m.status === "joue" && m.numero_journee)
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
  if (played[0]?.numero_journee) return played[0].numero_journee;

  return journeeOptions[0];
}

function MatchCard({ m }) {
  const isPlayed = m.status === "joue";
  const homeIsUs = m.home_away === "domicile";

  const leftName = homeIsUs ? "Nous" : m.opponent;
  const rightName = homeIsUs ? m.opponent : "Nous";
  const leftLogo = homeIsUs ? m.us_logo_asset : m.opponent_logo_asset;
  const rightLogo = homeIsUs ? m.opponent_logo_asset : m.us_logo_asset;
  const leftScore = homeIsUs ? m.team_score_us : m.team_score_them;
  const rightScore = homeIsUs ? m.team_score_them : m.team_score_us;

  return (
    <div className="flex flex-col gap-2 rounded-card bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 items-center gap-2 sm:gap-3">
        <span
          className={`w-16 shrink-0 truncate text-right text-sm sm:w-28 ${
            homeIsUs ? "font-bold text-navy" : "text-ink/70"
          }`}
        >
          {leftName}
        </span>
        <Crest assetId={leftLogo} alt={leftName} />

        <div className="flex min-w-[64px] flex-col items-center px-1">
          {isPlayed ? (
            <span className="font-display text-lg font-bold text-navy">
              {leftScore ?? "–"} - {rightScore ?? "–"}
            </span>
          ) : (
            <span className="font-display text-sm text-ink/50">
              {m.match_date ? formatDateTime(m.match_date).split(" ").pop() : "?"}
            </span>
          )}
        </div>

        <Crest assetId={rightLogo} alt={rightName} />
        <span
          className={`w-16 shrink-0 truncate text-sm sm:w-28 ${
            !homeIsUs ? "font-bold text-navy" : "text-ink/70"
          }`}
        >
          {rightName}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <p className="text-xs text-ink/40">{m.location || "Lieu inconnu"}</p>

        {!isPlayed && m.source === "manuel" && (
          <form action={recordScore} className="flex items-center gap-1">
            <input type="hidden" name="match_id" value={m.id} />
            <input
              type="number"
              min="0"
              name="team_score_us"
              placeholder="Nous"
              className="w-12 rounded-lg border border-ink/15 px-1 py-0.5 text-xs"
            />
            <input
              type="number"
              min="0"
              name="team_score_them"
              placeholder="Eux"
              className="w-12 rounded-lg border border-ink/15 px-1 py-0.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-white hover:bg-navy-light"
            >
              OK
            </button>
          </form>
        )}

        {/* Un match issu d'une synchro FFBB n'est jamais supprimable — seuls
            les matchs ajoutés à la main le sont (voir aussi le garde-fou
            côté serveur dans deleteMatch). */}
        {m.source === "manuel" && (
          <form action={deleteMatch}>
            <input type="hidden" name="match_id" value={m.id} />
            <button type="submit" className="text-xs font-semibold text-ink/30 hover:text-cardinal">
              ✕
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function CalendrierTab({ matches, journeeOptions, selectedJournee, participantSportId }) {
  if (matches.length === 0) {
    return (
      <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
        Aucun match enregistré pour l'instant — synchronise avec la FFBB ci-dessus, ou ajoute un match
        manuellement.
      </div>
    );
  }

  const journeeMatches = selectedJournee
    ? matches.filter((m) => m.numero_journee === selectedJournee)
    : matches;
  const currentIndex = journeeOptions.indexOf(selectedJournee);
  const prevJournee = currentIndex > 0 ? journeeOptions[currentIndex - 1] : null;
  const nextJournee =
    currentIndex >= 0 && currentIndex < journeeOptions.length - 1 ? journeeOptions[currentIndex + 1] : null;

  const undated = matches.filter((m) => !m.numero_journee);

  return (
    <div className="space-y-4">
      {journeeOptions.length > 0 && (
        <div className="flex items-center justify-center gap-3 rounded-full bg-white px-2 py-1.5 shadow-sm">
          <Link
            href={
              prevJournee
                ? `/basket?ps=${participantSportId}&journee=${encodeURIComponent(prevJournee)}`
                : "#"
            }
            aria-disabled={!prevJournee}
            className={`px-2 text-lg font-bold ${prevJournee ? "text-navy hover:text-cardinal" : "text-ink/20"}`}
          >
            ‹
          </Link>
          <span className="font-display text-sm uppercase tracking-tight text-navy">
            {Number.isNaN(Number(selectedJournee))
              ? selectedJournee
              : `${selectedJournee}${selectedJournee === "1" ? "re" : "e"} journée`}
          </span>
          <Link
            href={
              nextJournee
                ? `/basket?ps=${participantSportId}&journee=${encodeURIComponent(nextJournee)}`
                : "#"
            }
            aria-disabled={!nextJournee}
            className={`px-2 text-lg font-bold ${nextJournee ? "text-navy hover:text-cardinal" : "text-ink/20"}`}
          >
            ›
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {journeeMatches.map((m) => (
          <MatchCard key={m.id} m={m} />
        ))}
        {journeeMatches.length === 0 && (
          <p className="rounded-card bg-white p-4 text-center text-sm text-ink/40 shadow-sm">
            Pas de match sur cette journée.
          </p>
        )}
      </div>

      {undated.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40">
            Matchs sans journée renseignée
          </p>
          <div className="space-y-2">
            {undated.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClassementTab({ classement }) {
  if (classement.length === 0) {
    return (
      <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
        Pas de classement synchronisé pour l'instant — lance une synchro FFBB ci-dessus.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/40">
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Équipe</th>
            <th className="px-4 py-2 text-right">Pts</th>
            <th className="px-4 py-2 text-right">J</th>
            <th className="px-4 py-2 text-right">G-P</th>
          </tr>
        </thead>
        <tbody>
          {classement
            .slice()
            .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
            .map((c) => (
              <tr
                key={c.id}
                className={`border-b border-ink/5 last:border-0 ${
                  c.is_us ? "bg-cardinal-light font-bold text-cardinal-dark" : "text-ink"
                }`}
              >
                <td className="px-4 py-2">{c.position ?? "—"}</td>
                <td className="px-4 py-2">{c.engagement_nom ?? "Équipe inconnue"}</td>
                <td className="px-4 py-2 text-right font-display">{c.points ?? "—"}</td>
                <td className="px-4 py-2 text-right text-ink/60">{c.matches_joues ?? "—"}</td>
                <td className="px-4 py-2 text-right text-ink/60">
                  {c.gagnes ?? "—"}-{c.perdus ?? "—"}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// Stats dérivées de NOS matchs joués (marqués/encaissés, bilan dom./ext.,
// série en cours...). La FFBB (fédération, championnats amateurs) ne
// publie pas de statistiques joueur par joueur dans son API publique —
// contrairement à la LNB qui gère le Betclic Elite (une ligue professionnelle
// séparée, avec son propre système de stats). Donc pas d'équivalent
// "adresse aux lancers francs" par joueur possible ici avec des vraies
// données ; on affiche plutôt un bilan d'équipe, dans le même esprit de
// sous-tableau compact.
function computeTeamStats(playedMatches) {
  if (playedMatches.length === 0) return null;

  let wins = 0;
  let losses = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  let homeWins = 0;
  let homeLosses = 0;
  let awayWins = 0;
  let awayLosses = 0;
  let best = null;
  let worst = null;
  let currentStreak = { type: null, count: 0 };

  const chrono = [...playedMatches].sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  chrono.forEach((m) => {
    if (m.team_score_us == null || m.team_score_them == null) return;
    const diff = m.team_score_us - m.team_score_them;
    const won = diff > 0;

    pointsFor += m.team_score_us;
    pointsAgainst += m.team_score_them;

    if (won) {
      wins += 1;
      if (m.home_away === "domicile") homeWins += 1;
      else awayWins += 1;
    } else {
      losses += 1;
      if (m.home_away === "domicile") homeLosses += 1;
      else awayLosses += 1;
    }

    if (best == null || diff > best.diff) best = { m, diff };
    if (worst == null || diff < worst.diff) worst = { m, diff };

    if (currentStreak.type === (won ? "V" : "D")) {
      currentStreak.count += 1;
    } else {
      currentStreak = { type: won ? "V" : "D", count: 1 };
    }
  });

  const played = wins + losses;
  if (played === 0) return null;

  return {
    played,
    wins,
    losses,
    pointsForAvg: pointsFor / played,
    pointsAgainstAvg: pointsAgainst / played,
    diffAvg: (pointsFor - pointsAgainst) / played,
    homeRecord: `${homeWins}-${homeLosses}`,
    awayRecord: `${awayWins}-${awayLosses}`,
    best,
    worst,
    currentStreak,
  };
}

function StatRow({ label, value }) {
  return (
    <tr className="border-b border-ink/5 last:border-0">
      <td className="px-4 py-2 text-sm text-ink/60">{label}</td>
      <td className="px-4 py-2 text-right font-display text-sm font-bold text-navy">{value}</td>
    </tr>
  );
}

function StatsTab({ playedMatches }) {
  const stats = computeTeamStats(playedMatches);

  return (
    <div className="space-y-4">
      <p className="rounded-card bg-lagoon-light p-3 text-xs text-navy">
        La FFBB (fédération, championnats amateurs) ne publie pas de statistiques joueur par joueur —
        c'est la LNB, qui gère le Betclic Elite (une ligue professionnelle à part), qui a son propre
        système de stats. Ici, un bilan calculé à partir des matchs de l'équipe.
      </p>

      {!stats ? (
        <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
          Pas encore de match joué pour calculer un bilan.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card bg-white shadow-sm">
          <div className="bg-navy px-4 py-2 text-white">
            <p className="font-display text-sm uppercase tracking-tight">Bilan de la saison</p>
          </div>
          <table className="w-full">
            <tbody>
              <StatRow label="Matchs joués" value={stats.played} />
              <StatRow label="Bilan" value={`${stats.wins}V - ${stats.losses}D`} />
              <StatRow label="Bilan à domicile" value={stats.homeRecord} />
              <StatRow label="Bilan à l'extérieur" value={stats.awayRecord} />
              <StatRow label="Points marqués / match" value={stats.pointsForAvg.toFixed(1)} />
              <StatRow label="Points encaissés / match" value={stats.pointsAgainstAvg.toFixed(1)} />
              <StatRow
                label="Écart moyen"
                value={`${stats.diffAvg > 0 ? "+" : ""}${stats.diffAvg.toFixed(1)}`}
              />
              <StatRow
                label="Série en cours"
                value={stats.currentStreak.type ? `${stats.currentStreak.count}${stats.currentStreak.type}` : "—"}
              />
              {stats.best && (
                <StatRow
                  label="Meilleure perf."
                  value={`+${stats.best.diff} vs ${stats.best.m.opponent}`}
                />
              )}
              {stats.worst && stats.worst.diff < 0 && (
                <StatRow
                  label="Plus large défaite"
                  value={`${stats.worst.diff} vs ${stats.worst.m.opponent}`}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function BasketPage({ searchParams }) {
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

  const selectedPsId = searchParams?.ps || assignments?.[0]?.id || null;
  const selectedPs = (assignments ?? []).find((a) => a.id === selectedPsId) ?? null;
  const tab = ["calendrier", "classement", "stats"].includes(searchParams?.tab)
    ? searchParams.tab
    : "calendrier";

  let matches = [];
  let classement = [];
  if (selectedPsId) {
    const { data: matchRows } = await supabase
      .from("basketball_matches")
      .select("*")
      .eq("participant_sport_id", selectedPsId)
      .order("match_date", { ascending: true });
    matches = matchRows ?? [];

    const { data: classementRows } = await supabase
      .from("basketball_classements")
      .select("*")
      .eq("participant_sport_id", selectedPsId);
    classement = classementRows ?? [];
  }

  const journeeOptions = buildJourneeOptions(matches);
  const selectedJournee = searchParams?.journee || defaultJournee(matches, journeeOptions);
  const playedMatches = matches.filter((m) => m.status === "joue");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">Basket</h1>
        <p className="mt-1 text-ink/60">Calendrier, classement et bilan, synchronisables depuis la FFBB.</p>
      </div>

      <p className="rounded-card bg-lagoon-light p-3 text-xs text-navy">
        La synchronisation FFBB utilise une API non officielle (reverse engineering). Elle peut échouer
        ou nécessiter de renseigner l'ID FFBB à la main — le message d'erreur sous chaque participant
        t'indique quoi faire dans ce cas.
      </p>

      {(!assignments || assignments.length === 0) ? (
        <div className="rounded-card bg-white p-8 text-center shadow-sm">
          <p className="text-ink/60">Personne n'est encore associé au basket. Configure ça dans Paramètres.</p>
        </div>
      ) : (
        <>
          <SyncCard ps={selectedPs} />

          <details className="rounded-card bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-navy">
              Ajouter un match manuellement
            </summary>
            <form action={addMatch} className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="participant_sport_id" value={selectedPsId} />
              <input
                type="datetime-local"
                name="match_date"
                required
                className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
              />
              <select name="home_away" className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm">
                <option value="domicile">Domicile</option>
                <option value="exterieur">Extérieur</option>
              </select>
              <input
                name="opponent"
                placeholder="Adversaire"
                required
                className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm sm:col-span-2"
              />
              <input
                name="location"
                placeholder="Lieu / salle"
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

          {assignments.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {assignments.map((a) => (
                <Link
                  key={a.id}
                  href={`/basket?ps=${a.id}&tab=${tab}`}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    a.id === selectedPsId ? "bg-cardinal text-white" : "bg-white text-ink/50 hover:text-ink"
                  }`}
                >
                  {a.participants?.first_name}
                </Link>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Link
              href={`/basket?ps=${selectedPsId}&tab=calendrier`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                tab === "calendrier" ? "bg-navy text-white" : "bg-white text-ink/60"
              }`}
            >
              Calendrier &amp; résultats
            </Link>
            <Link
              href={`/basket?ps=${selectedPsId}&tab=classement`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                tab === "classement" ? "bg-navy text-white" : "bg-white text-ink/60"
              }`}
            >
              Classement
            </Link>
            <Link
              href={`/basket?ps=${selectedPsId}&tab=stats`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                tab === "stats" ? "bg-navy text-white" : "bg-white text-ink/60"
              }`}
            >
              Stats
            </Link>
          </div>

          {tab === "calendrier" && (
            <CalendrierTab
              matches={matches}
              journeeOptions={journeeOptions}
              selectedJournee={selectedJournee}
              participantSportId={selectedPsId}
            />
          )}
          {tab === "classement" && <ClassementTab classement={classement} />}
          {tab === "stats" && <StatsTab playedMatches={playedMatches} />}
        </>
      )}
    </div>
  );
}
