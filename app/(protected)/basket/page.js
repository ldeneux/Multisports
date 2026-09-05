import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, ffbbAssetUrl, computeCurrentSeasonLabel } from "@/lib/utils";
import SyncButton from "@/components/SyncButton";
import SeasonSelect from "@/components/SeasonSelect";
import {
  addMatch,
  recordScore,
  deleteMatch,
  updateFfbbId,
  syncFfbbMatches,
} from "./actions";

export const dynamic = "force-dynamic";

// Initiales utilisées comme repli quand un club n'a pas de logo dans l'API
// FFBB (fréquent pour les clubs amateurs) — bien plus lisible qu'un "?" qui
// ne veut rien dire.
function initials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Crest({ assetId, name }) {
  const url = ffbbAssetUrl(assetId, { width: 64 });
  if (!url) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand text-[10px] font-bold text-ink/40">
        {initials(name)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className="h-8 w-8 shrink-0 rounded-full object-contain" />;
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

function MatchCard({ m, clubName }) {
  const isPlayed = m.status === "joue";
  const usIsLeft = m.us_is_team1 === true;
  const usIsRight = m.us_is_team1 === false;
  const concernsUs = m.us_is_team1 !== null;

  // Convention FFBB : "équipe 1" = domicile -> toujours affichée à gauche.
  const leftName = usIsLeft ? clubName || "Nous" : m.team1_name || "Équipe inconnue";
  const rightName = usIsRight ? clubName || "Nous" : m.team2_name || "Équipe inconnue";
  const leftScore = m.team1_score;
  const rightScore = m.team2_score;

  // Code couleur : victoire (ou match ne nous concernant pas) = couleur par
  // défaut (navy) ; défaite de notre équipe = notre score en rouge
  // (cardinal), celui de l'adversaire en bleu (lagoon).
  let leftColor = "text-navy";
  let rightColor = "text-navy";
  if (concernsUs && isPlayed && leftScore != null && rightScore != null) {
    const usScore = usIsLeft ? leftScore : rightScore;
    const themScore = usIsLeft ? rightScore : leftScore;
    if (usScore < themScore) {
      leftColor = usIsLeft ? "text-cardinal" : "text-lagoon";
      rightColor = usIsRight ? "text-cardinal" : "text-lagoon";
    }
  }

  const dateObj = m.match_date ? new Date(m.match_date) : null;
  const shortDate = dateObj
    ? dateObj.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    : null;
  const shortTime = dateObj
    ? dateObj.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col gap-2 rounded-card bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <span
          title={leftName}
          className={`w-20 shrink-0 truncate text-right text-sm sm:w-32 md:w-40 ${
            usIsLeft ? "font-bold text-navy" : "text-ink/70"
          }`}
        >
          {leftName}
        </span>
        <Crest assetId={m.team1_logo_asset} name={leftName} />

        <div className="flex min-w-[68px] shrink-0 flex-col items-center px-1">
          {isPlayed ? (
            <span className="font-display text-lg font-bold">
              <span className={leftColor}>{leftScore ?? "–"}</span>
              <span className="text-navy"> - </span>
              <span className={rightColor}>{rightScore ?? "–"}</span>
            </span>
          ) : (
            <span className="flex flex-col items-center leading-tight">
              {shortDate && (
                <span className="text-[10px] uppercase tracking-wide text-ink/40">{shortDate}</span>
              )}
              <span className="font-display text-sm text-ink/60">{shortTime ?? "?"}</span>
            </span>
          )}
        </div>

        <Crest assetId={m.team2_logo_asset} name={rightName} />
        <span
          title={rightName}
          className={`w-20 shrink-0 truncate text-sm sm:w-32 md:w-40 ${
            usIsRight ? "font-bold text-navy" : "text-ink/70"
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
              placeholder={clubName || "Nous"}
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

function CalendrierTab({ matches, journeeOptions, selectedJournee, participantSportId, tab, scope, clubName }) {
  if (matches.length === 0) {
    return (
      <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
        {scope === "poule"
          ? "Aucun match dans la poule pour l'instant — synchronise avec la FFBB ci-dessus."
          : "Aucun match ne concerne cette équipe pour l'instant — synchronise avec la FFBB ci-dessus, ou ajoute un match manuellement."}
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

  const journeeHref = (j) =>
    `/basket?ps=${participantSportId}&tab=${tab}&scope=${scope}&journee=${encodeURIComponent(j)}`;

  return (
    <div className="space-y-4">
      {journeeOptions.length > 0 && (
        <div className="flex items-center justify-center gap-3 rounded-full bg-white px-2 py-1.5 shadow-sm">
          <Link
            href={prevJournee ? journeeHref(prevJournee) : "#"}
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
            href={nextJournee ? journeeHref(nextJournee) : "#"}
            aria-disabled={!nextJournee}
            className={`px-2 text-lg font-bold ${nextJournee ? "text-navy hover:text-cardinal" : "text-ink/20"}`}
          >
            ›
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {journeeMatches.map((m) => (
          <MatchCard key={m.id} m={m} clubName={clubName} />
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
              <MatchCard key={m.id} m={m} clubName={clubName} />
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
        Pas de classement synchronisé pour cette saison — lance une synchro FFBB ci-dessus.
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
    if (m.us_is_team1 === null || m.us_is_team1 === undefined) return;
    const usScore = m.us_is_team1 ? m.team1_score : m.team2_score;
    const themScore = m.us_is_team1 ? m.team2_score : m.team1_score;
    const opponentName = m.us_is_team1 ? m.team2_name : m.team1_name;
    if (usScore == null || themScore == null) return;

    const diff = usScore - themScore;
    const won = diff > 0;
    const isHome = m.us_is_team1; // équipe 1 = domicile, par convention FFBB

    pointsFor += usScore;
    pointsAgainst += themScore;

    if (won) {
      wins += 1;
      if (isHome) homeWins += 1;
      else awayWins += 1;
    } else {
      losses += 1;
      if (isHome) homeLosses += 1;
      else awayLosses += 1;
    }

    if (best == null || diff > best.diff) best = { diff, opponent: opponentName };
    if (worst == null || diff < worst.diff) worst = { diff, opponent: opponentName };

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
                <StatRow label="Meilleure perf." value={`+${stats.best.diff} vs ${stats.best.opponent}`} />
              )}
              {stats.worst && stats.worst.diff < 0 && (
                <StatRow label="Plus large défaite" value={`${stats.worst.diff} vs ${stats.worst.opponent}`} />
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
  const currentSeason = computeCurrentSeasonLabel();

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
  const scope = ["us", "poule"].includes(searchParams?.scope) ? searchParams.scope : "us";

  // Saisons disponibles pour ce participant — toujours au moins la saison en
  // cours, même si rien n'a encore été synchronisé.
  let seasonOptions = [currentSeason];
  if (selectedPsId) {
    const { data: seasonRows } = await supabase
      .from("basketball_matches")
      .select("season")
      .eq("participant_sport_id", selectedPsId);
    const set = new Set([currentSeason, ...(seasonRows ?? []).map((r) => r.season).filter(Boolean)]);
    seasonOptions = [...set].sort().reverse();
  }
  const selectedSeason =
    searchParams?.season && seasonOptions.includes(searchParams.season) ? searchParams.season : currentSeason;
  const isCurrentSeason = selectedSeason === currentSeason;

  let matches = [];
  let classement = [];
  if (selectedPsId) {
    const { data: matchRows } = await supabase
      .from("basketball_matches")
      .select("*")
      .eq("participant_sport_id", selectedPsId)
      .eq("season", selectedSeason)
      .order("match_date", { ascending: true });
    matches = matchRows ?? [];

    const { data: classementRows } = await supabase
      .from("basketball_classements")
      .select("*")
      .eq("participant_sport_id", selectedPsId)
      .eq("season", selectedSeason);
    classement = classementRows ?? [];
  }

  // Les stats/le bilan d'équipe ne concernent toujours QUE notre équipe,
  // indépendamment du bouton "Sathonay Camp / Toute la poule" (qui ne filtre
  // que le calendrier).
  const playedMatches = matches.filter((m) => m.us_is_team1 !== null && m.status === "joue");
  const scopedMatches = scope === "poule" ? matches : matches.filter((m) => m.us_is_team1 !== null);

  const journeeOptions = buildJourneeOptions(scopedMatches);
  const selectedJournee = searchParams?.journee || defaultJournee(scopedMatches, journeeOptions);

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
          {/* Qui, et quelle saison : tout ce qui suit (synchro, calendrier,
              classement, stats) dépend de ces deux choix — d'où leur
              position tout en haut, avant le bloc de synchro. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {assignments.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {assignments.map((a) => (
                  <Link
                    key={a.id}
                    href={`/basket?ps=${a.id}&tab=${tab}&scope=${scope}`}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      a.id === selectedPsId ? "bg-cardinal text-white" : "bg-white text-ink/50 hover:text-ink"
                    }`}
                  >
                    {a.participants?.first_name}
                  </Link>
                ))}
              </div>
            ) : (
              <span />
            )}
            <SeasonSelect
              seasons={seasonOptions}
              value={selectedSeason}
              basePath={`/basket?ps=${selectedPsId}&tab=${tab}&scope=${scope}`}
            />
          </div>

          {isCurrentSeason ? (
            <SyncCard ps={selectedPs} />
          ) : (
            <div className="rounded-card bg-sand p-4 text-sm text-ink/60 shadow-sm">
              Saison {selectedSeason} — archive en lecture seule. La synchronisation FFBB ne concerne que
              la saison en cours ({currentSeason}).
            </div>
          )}

          {isCurrentSeason && (
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
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/basket?ps=${selectedPsId}&tab=calendrier&scope=${scope}`}
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

            {tab === "calendrier" && (
              <div className="ml-auto flex overflow-hidden rounded-full bg-white shadow-sm">
                <Link
                  href={`/basket?ps=${selectedPsId}&tab=calendrier&scope=us`}
                  className={`px-3 py-1.5 text-xs font-semibold ${
                    scope === "us" ? "bg-navy text-white" : "text-ink/50 hover:text-ink"
                  }`}
                >
                  {selectedPs?.club || "Sathonay Camp"}
                </Link>
                <Link
                  href={`/basket?ps=${selectedPsId}&tab=calendrier&scope=poule`}
                  className={`px-3 py-1.5 text-xs font-semibold ${
                    scope === "poule" ? "bg-navy text-white" : "text-ink/50 hover:text-ink"
                  }`}
                >
                  Toute la poule
                </Link>
              </div>
            )}
          </div>

          {tab === "calendrier" && (
            <CalendrierTab
              matches={scopedMatches}
              journeeOptions={journeeOptions}
              selectedJournee={selectedJournee}
              participantSportId={selectedPsId}
              tab={tab}
              scope={scope}
              clubName={selectedPs?.club}
            />
          )}
          {tab === "classement" && <ClassementTab classement={classement} />}
          {tab === "stats" && <StatsTab playedMatches={playedMatches} />}
        </>
      )}
    </div>
  );
}
