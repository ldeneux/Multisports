import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, ffbbAssetUrl, computeCurrentSeasonLabel } from "@/lib/utils";
import SyncButton from "@/components/SyncButton";
import SeasonSelect from "@/components/SeasonSelect";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import {
  RadarChart,
  StackedBarChart,
  SimpleBarChart,
  BarLineChart,
  DualLineChart,
  DonutChart,
  IsoBarChart,
  PyramidChart,
  ChartInfo,
} from "@/components/BasketCharts";
import {
  addMatch,
  saveMatchSheet,
  resetMatchSheet,
  saveMatchStats,
  togglePlayerOnSheet,
  addPlayer,
  updatePlayer,
  deletePlayer,
  deleteMatch,
  resetCurrentSeason,
  addPhase,
  updatePhase,
  deletePhase,
  syncPhase,
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

function Crest({ assetId, logoUrl, name }) {
  const url = logoUrl || ffbbAssetUrl(assetId, { width: 64 });
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

// "NEUVILLE BASKET - 2" -> "NEUVILLE BASKET" — même normalisation que côté
// serveur (actions.js), pour retrouver la fiche club correspondante quel
// que soit le suffixe d'équipe.
function stripTeamSuffix(name) {
  return (name || "").trim().replace(/\s*-\s*\d+\s*$/, "");
}

// Barre "compétition jouée" : nom de la compétition + poule (avec lien vers
// competitions.ffbb.com si renseigné), bascule entre phases quand il y en a
// plusieurs dans la saison (ex. Saison régulière / Phase 2 / Phase 3), et
// panneau de gestion (ajout/édition/suppression/synchro par phase). Chaque
// phase a son propre ID FFBB (engagement) — c'est ce qui permet de suivre
// plusieurs compétitions successives dans la même saison.
function PhaseBar({ phases, selectedPhase, selectedPsId, tab, scope, season, isCurrentSeason, journeeQS = "" }) {
  const linkBase = `/basket?ps=${selectedPsId}&tab=${tab}&scope=${scope}&season=${encodeURIComponent(season)}${journeeQS}`;
  const isAmical = selectedPhase?.phase_type === "amical";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {phases.length > 1 &&
          phases.map((p) => (
            <Link
              key={p.id}
              href={`${linkBase}&phase=${p.id}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                p.id === selectedPhase?.id ? "bg-navy text-white" : "bg-white text-ink/50 hover:text-ink"
              }`}
            >
              {p.phase_name}
            </Link>
          ))}

        {selectedPhase &&
          (isAmical ? (
            <p className="text-sm text-ink/50">🤝 Matchs saisis à la main, jamais synchronisés.</p>
          ) : (
            (selectedPhase.competition_name || selectedPhase.poule_label) && (
              <p className="text-sm">
                {selectedPhase.competition_url ? (
                  <a
                    href={selectedPhase.competition_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-navy underline decoration-dotted hover:text-cardinal"
                  >
                    {selectedPhase.competition_name}
                  </a>
                ) : (
                  <span className="font-semibold text-navy">{selectedPhase.competition_name}</span>
                )}
                {selectedPhase.poule_label && (
                  <span className="text-ink/50"> · {selectedPhase.poule_label}</span>
                )}
              </p>
            )
          ))}

        {isCurrentSeason && selectedPhase && !isAmical && (
          <form action={syncPhase} className="ml-auto">
            <input type="hidden" name="phase_id" value={selectedPhase.id} />
            <SyncButton className="rounded-full bg-lagoon px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
              Synchroniser
            </SyncButton>
          </form>
        )}
      </div>

      {!isAmical && selectedPhase?.last_sync_at && (
        <p className={`text-xs ${selectedPhase.last_sync_error ? "text-cardinal-dark" : "text-ink/40"}`}>
          Dernière synchro : {formatDateTime(selectedPhase.last_sync_at)}
          {selectedPhase.last_sync_error ? ` — ${selectedPhase.last_sync_error}` : " — OK"}
        </p>
      )}

      {phases.length === 0 && (
        <div className="rounded-card bg-sand p-3 text-sm text-ink/60">
          {isCurrentSeason
            ? "Aucune phase configurée pour cette saison — ajoutes-en une ci-dessous (ex. « Saison régulière »)."
            : "Aucune phase pour cette saison archivée."}
        </div>
      )}

      {isCurrentSeason && (
        <details className="rounded-card bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-navy">
            Gérer les phases de la saison {season}
          </summary>

          <div className="mt-3 space-y-3">
            {phases.map((p) => (
              <div key={p.id} className="rounded-lg bg-sand p-3">
                <form action={updatePhase} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input type="hidden" name="phase_id" value={p.id} />
                  <input
                    name="phase_name"
                    defaultValue={p.phase_name}
                    placeholder="Nom de la phase"
                    className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
                  />
                  {p.phase_type === "amical" ? (
                    <p className="flex items-center text-xs text-ink/40 sm:col-span-2">
                      🤝 Phase amicale — pas d'ID FFBB, jamais synchronisée.
                    </p>
                  ) : (
                    <>
                      <input
                        name="ffbb_engagement_id"
                        defaultValue={p.ffbb_engagement_id ?? ""}
                        placeholder="ID FFBB (engagement)"
                        className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
                      />
                      <input
                        name="competition_url"
                        defaultValue={p.competition_url ?? ""}
                        placeholder="Lien competitions.ffbb.com (optionnel)"
                        className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
                      />
                    </>
                  )}
                  <button
                    type="submit"
                    className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-light"
                  >
                    Enregistrer
                  </button>
                </form>
                <form action={deletePhase} className="mt-2">
                  <input type="hidden" name="phase_id" value={p.id} />
                  <ConfirmSubmitButton
                    confirmMessage={`Supprimer la phase « ${p.phase_name} » et tous ses matchs/classement ? Cette action est irréversible.`}
                    className="text-xs font-semibold text-ink/40 hover:text-cardinal"
                  >
                    Supprimer cette phase
                  </ConfirmSubmitButton>
                </form>
              </div>
            ))}

            <form action={addPhase} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <input type="hidden" name="participant_sport_id" value={selectedPsId} />
              <input
                name="phase_name"
                placeholder="ex. Phase 2 / Matchs amicaux"
                required
                className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
              />
              <select name="phase_type" className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm">
                <option value="ffbb">Compétition FFBB</option>
                <option value="amical">Matchs amicaux (saisie manuelle)</option>
              </select>
              <input
                name="ffbb_engagement_id"
                placeholder="ID FFBB (engagement, si compétition FFBB)"
                className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
              />
              <input
                name="competition_url"
                placeholder="Lien competitions.ffbb.com (optionnel)"
                className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-cardinal px-3 py-1.5 text-xs font-semibold text-white hover:bg-cardinal-dark"
              >
                Ajouter une phase
              </button>
            </form>
          </div>
        </details>
      )}
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

function MatchCard({ m, typeIcon, sheetBaseHref, clubLogos }) {
  const isPlayed = m.status === "joue";
  const usIsLeft = m.us_is_team1 === true;
  const usIsRight = m.us_is_team1 === false;
  const concernsUs = m.us_is_team1 !== null;

  // Le nom affiché est TOUJOURS celui renvoyé par la FFBB (ou saisi à la
  // main pour un match manuel) — jamais remplacé automatiquement par le nom
  // du club configuré dans Paramètres. Ça permet de repérer tout de suite
  // une erreur d'ID FFBB (le mauvais club apparaît sous son vrai nom au lieu
  // d'être maquillé en "Sathonay Camp"), et de consulter ponctuellement le
  // calendrier d'une autre poule sans que l'app ne le déguise en "nous".
  // Convention FFBB : "équipe 1" = domicile -> toujours affichée à gauche.
  const leftName = m.team1_name || "Équipe inconnue";
  const rightName = m.team2_name || "Équipe inconnue";
  const leftScore = m.team1_score;
  const rightScore = m.team2_score;

  // Priorité à la fiche club (partagée entre tous les matchs, alimentée par
  // la synchro et éditable à la main pour un logo que la FFBB n'a pas, ex.
  // Sathonay) — repli sur l'ancien champ stocké directement sur le match
  // pour les données déjà chargées avant l'introduction de cette table.
  const leftClub = clubLogos?.get(stripTeamSuffix(leftName));
  const rightClub = clubLogos?.get(stripTeamSuffix(rightName));

  // Code couleur : seul NOTRE score change de couleur (celui de l'adversaire
  // reste toujours navy, neutre) — victoire = bleu (lagoon), défaite = rouge
  // (cardinal), match nul = vert (emerald). Un seul repère visuel simple,
  // plutôt que l'ancien codage à deux couleurs de chaque côté.
  let leftColor = "text-navy";
  let rightColor = "text-navy";
  if (concernsUs && isPlayed && leftScore != null && rightScore != null) {
    const usScore = usIsLeft ? leftScore : rightScore;
    const themScore = usIsLeft ? rightScore : leftScore;
    const usColor =
      usScore > themScore ? "text-lagoon" : usScore < themScore ? "text-cardinal" : "text-emerald-600";
    if (usIsLeft) leftColor = usColor;
    if (usIsRight) rightColor = usColor;
  }

  const dateObj = m.match_date ? new Date(m.match_date) : null;
  const shortDate = dateObj
    ? dateObj.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    : null;
  const shortTime = dateObj
    ? dateObj.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex items-center gap-2 rounded-card bg-white p-3 shadow-sm sm:gap-3">
      {typeIcon &&
        (typeIcon.startsWith("http") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={typeIcon} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
        ) : (
          <span className="shrink-0 text-lg leading-none" aria-hidden="true">
            {typeIcon}
          </span>
        ))}
      <span
        title={leftName}
        className={`min-w-0 flex-1 truncate text-right text-sm ${
          usIsLeft ? "font-bold text-navy" : "text-ink/70"
        }`}
      >
        {leftName}
      </span>
      <Crest assetId={leftClub?.logo_asset ?? m.team1_logo_asset} logoUrl={leftClub?.logo_url} name={leftName} />

      {/* Cliquer sur la date (match à venir) ou le score (match joué) ouvre
          la feuille de match complète — plus aucune saisie sur la ligne.
          Largeur fixe (pas juste min-w) pour que les deux noms d'équipe se
          partagent exactement le même espace de chaque côté, quelle que
          soit la longueur du lieu (retiré d'ici — visible dans la feuille
          de match au clic). whitespace-nowrap sur le score : un score à 3
          chiffres de chaque côté ne doit jamais retomber sur deux lignes. */}
      <Link
        href={`${sheetBaseHref}&feuille=${m.id}`}
        scroll={false}
        className="flex w-20 shrink-0 flex-col items-center rounded-lg px-1 py-0.5 hover:bg-sand"
        title="Ouvrir la feuille de match"
      >
        {isPlayed ? (
          <span className="whitespace-nowrap font-display text-lg font-bold">
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
      </Link>

      <Crest assetId={rightClub?.logo_asset ?? m.team2_logo_asset} logoUrl={rightClub?.logo_url} name={rightName} />
      <span
        title={rightName}
        className={`min-w-0 flex-1 truncate text-sm ${
          usIsRight ? "font-bold text-navy" : "text-ink/70"
        }`}
      >
        {rightName}
      </span>

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
  );
}

function journeeLabel(value) {
  return Number.isNaN(Number(value)) ? value : `${value}${value === "1" ? "re" : "e"} journée`;
}

function CalendrierTab({
  matches,
  journeeOptions,
  selectedJournee,
  participantSportId,
  tab,
  scope,
  season,
  phaseId,
  journeesMode,
  typeIcon,
  clubLogos,
}) {
  if (matches.length === 0) {
    return (
      <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
        {scope === "poule"
          ? "Aucun match dans la poule pour l'instant — synchronise avec la FFBB ci-dessus."
          : "Aucun match ne concerne cette équipe pour l'instant — synchronise avec la FFBB ci-dessus, ou ajoute un match manuellement."}
      </div>
    );
  }

  // phase= est indispensable ici : sans lui, changer de journée ou basculer
  // "Toutes" retombe systématiquement sur la première phase de la saison.
  const baseParams = `ps=${participantSportId}&tab=${tab}&scope=${scope}&season=${encodeURIComponent(season)}&phase=${phaseId ?? ""}`;
  const journeeHref = (j) => `/basket?${baseParams}&journees=une&journee=${encodeURIComponent(j)}`;
  const toutesHref = `/basket?${baseParams}&journees=toutes`;
  const uneHref = `/basket?${baseParams}&journees=une&journee=${encodeURIComponent(selectedJournee ?? "")}`;

  const currentIndex = journeeOptions.indexOf(selectedJournee);
  const prevJournee = currentIndex > 0 ? journeeOptions[currentIndex - 1] : null;
  const nextJournee =
    currentIndex >= 0 && currentIndex < journeeOptions.length - 1 ? journeeOptions[currentIndex + 1] : null;

  const undated = matches.filter((m) => !m.numero_journee);
  const showAll = journeesMode === "toutes";
  // Base d'URL réutilisée par chaque MatchCard pour ouvrir sa feuille de
  // match tout en préservant la vue actuelle (journée sélectionnée ou "toutes").
  const sheetBaseHref = showAll ? toutesHref : uneHref;

  // journée par journée, dans l'ordre — utilisé seulement en mode "toutes".
  const byJournee = journeeOptions.map((j) => ({
    journee: j,
    rows: matches.filter((m) => m.numero_journee === j),
  }));

  const journeeMatches = !showAll && selectedJournee ? matches.filter((m) => m.numero_journee === selectedJournee) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink/50">
        <span className="font-semibold text-ink/40">Notre score :</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-lagoon" />
          Victoire
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
          Nul
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-cardinal" />
          Défaite
        </span>
      </div>

      {journeeOptions.length > 0 && (
        <div className="flex items-center gap-2">
          {!showAll && (
            <div className="flex items-center gap-1.5 rounded-full bg-white px-1.5 py-1 shadow-sm">
              <Link
                href={prevJournee ? journeeHref(prevJournee) : "#"}
                scroll={false}
                aria-disabled={!prevJournee}
                className={`px-1.5 text-sm font-bold ${
                  prevJournee ? "text-navy hover:text-cardinal" : "text-ink/20"
                }`}
              >
                ‹
              </Link>
              <span className="font-display text-xs uppercase tracking-tight text-navy">
                {journeeLabel(selectedJournee)}
              </span>
              <Link
                href={nextJournee ? journeeHref(nextJournee) : "#"}
                scroll={false}
                aria-disabled={!nextJournee}
                className={`px-1.5 text-sm font-bold ${
                  nextJournee ? "text-navy hover:text-cardinal" : "text-ink/20"
                }`}
              >
                ›
              </Link>
            </div>
          )}

          <div className="ml-auto flex overflow-hidden rounded-full bg-white text-xs shadow-sm">
            <Link
              href={uneHref}
              scroll={false}
              className={`px-3 py-1.5 font-semibold ${
                !showAll ? "bg-navy text-white" : "text-ink/50 hover:text-ink"
              }`}
            >
              Une journée
            </Link>
            <Link
              href={toutesHref}
              scroll={false}
              className={`px-3 py-1.5 font-semibold ${
                showAll ? "bg-navy text-white" : "text-ink/50 hover:text-ink"
              }`}
            >
              Toutes
            </Link>
          </div>
        </div>
      )}

      {showAll ? (
        <div className="space-y-4">
          {byJournee.map(({ journee, rows }) => (
            <div key={journee}>
              <p className="mb-1.5 bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
                {journeeLabel(journee)}
              </p>
              <div className="space-y-2">
                {rows.map((m) => (
                  <MatchCard key={m.id} m={m} typeIcon={typeIcon} sheetBaseHref={sheetBaseHref} clubLogos={clubLogos} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {journeeMatches.map((m) => (
            <MatchCard key={m.id} m={m} typeIcon={typeIcon} sheetBaseHref={sheetBaseHref} clubLogos={clubLogos} />
          ))}
          {journeeMatches.length === 0 && (
            <p className="rounded-card bg-white p-4 text-center text-sm text-ink/40 shadow-sm">
              Pas de match sur cette journée.
            </p>
          )}
        </div>
      )}

      {undated.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/40">
            Matchs sans journée renseignée
          </p>
          <div className="space-y-2">
            {undated.map((m) => (
              <MatchCard key={m.id} m={m} typeIcon={typeIcon} sheetBaseHref={sheetBaseHref} clubLogos={clubLogos} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClassementTab({ classement, matches }) {
  if (classement.length === 0) {
    return (
      <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
        Pas de classement synchronisé pour cette saison — lance une synchro FFBB ci-dessus.
      </div>
    );
  }

  // BP (buts/points pour), BC (contre), diff et forme sont RECALCULÉS depuis
  // les matchs déjà synchronisés (on a toute la poule en base), plutôt que
  // d'attendre un éventuel champ FFBB dédié — plus fiable, et déjà
  // disponible immédiatement pour toute phase déjà synchronisée.
  const playedMatches = matches.filter((m) => m.status === "joue" && m.team1_score != null && m.team2_score != null);

  const rows = classement
    .slice()
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .map((c) => {
      const teamMatches = playedMatches.filter(
        (m) => m.team1_engagement_id === c.engagement_id || m.team2_engagement_id === c.engagement_id
      );
      const chrono = [...teamMatches].sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

      let bp = 0;
      let bc = 0;
      const forme = [];
      chrono.forEach((m) => {
        const isTeam1 = m.team1_engagement_id === c.engagement_id;
        const scoreFor = isTeam1 ? m.team1_score : m.team2_score;
        const scoreAgainst = isTeam1 ? m.team2_score : m.team1_score;
        bp += scoreFor;
        bc += scoreAgainst;
        forme.push(scoreFor > scoreAgainst ? "V" : "D");
      });

      // Logo : celui de cette équipe sur n'importe lequel de ses matchs déjà
      // synchronisés (chaque camp a le sien stocké par match).
      const logoMatch = matches.find(
        (m) => m.team1_engagement_id === c.engagement_id || m.team2_engagement_id === c.engagement_id
      );
      const logoAsset = logoMatch
        ? logoMatch.team1_engagement_id === c.engagement_id
          ? logoMatch.team1_logo_asset
          : logoMatch.team2_logo_asset
        : null;

      return {
        c,
        bp,
        bc,
        diff: bp - bc,
        ratio: bc > 0 ? bp / bc : null,
        lastFive: forme.slice(-5),
        logoAsset,
      };
    });

  return (
    <div className="overflow-x-auto rounded-card bg-white shadow-sm">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/40">
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Équipe</th>
            <th className="px-3 py-2 text-right">Pts</th>
            <th className="px-3 py-2 text-right">J</th>
            <th className="px-3 py-2 text-right">G-P</th>
            <th className="px-3 py-2 text-right">BP</th>
            <th className="px-3 py-2 text-right">BC</th>
            <th className="px-3 py-2 text-right">Diff</th>
            <th className="px-3 py-2 text-right">Ratio</th>
            <th className="px-3 py-2 text-left">Forme</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, bp, bc, diff, ratio, lastFive, logoAsset }) => (
            <tr
              key={c.id}
              className={`border-b border-ink/5 last:border-0 ${
                c.is_us ? "bg-cardinal-light font-bold text-cardinal-dark" : "text-ink"
              }`}
            >
              <td className="px-4 py-2">{c.position ?? "—"}</td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <Crest assetId={logoAsset} name={c.engagement_nom} />
                  <span>{c.engagement_nom ?? "Équipe inconnue"}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right font-display">{c.points ?? "—"}</td>
              <td className="px-3 py-2 text-right text-ink/60">{c.matches_joues ?? "—"}</td>
              <td
                className={`px-3 py-2 text-right font-semibold ${
                  (c.gagnes ?? 0) > (c.perdus ?? 0)
                    ? "text-lagoon"
                    : (c.perdus ?? 0) > (c.gagnes ?? 0)
                      ? "text-cardinal"
                      : "text-ink/60"
                }`}
              >
                {c.gagnes ?? "—"}-{c.perdus ?? "—"}
              </td>
              <td className="px-3 py-2 text-right text-ink/60">{bp || "—"}</td>
              <td className="px-3 py-2 text-right text-ink/60">{bc || "—"}</td>
              <td
                className={`px-3 py-2 text-right font-semibold ${
                  diff > 0 ? "text-lagoon" : diff < 0 ? "text-cardinal" : "text-ink/60"
                }`}
              >
                {diff > 0 ? "+" : ""}
                {diff || 0}
              </td>
              <td className="px-3 py-2 text-right text-ink/60">{ratio != null ? ratio.toFixed(2) : "—"}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  {lastFive.length === 0 ? (
                    <span className="text-ink/30">—</span>
                  ) : (
                    lastFive.map((r, i) => (
                      <span
                        key={i}
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                          r === "V" ? "bg-lagoon" : "bg-cardinal"
                        }`}
                      >
                        {r}
                      </span>
                    ))
                  )}
                </div>
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
    homeRecord: `${homeWins}V - ${homeLosses}D`,
    awayRecord: `${awayWins}V - ${awayLosses}D`,
    best,
    worst,
    currentStreak,
  };
}

// "12:30" -> 750 (secondes). Saisie libre côté formulaire, donc tolérant :
// ignore silencieusement tout ce qui ne ressemble pas à MM:SS plutôt que de
// planter l'affichage d'un graphique pour une ligne mal saisie.
// Réglages des indicateurs individuels — volontairement en constantes plutôt
// qu'en réglage d'écran pour l'instant, à ajuster ici si besoin.
// Discipline : nombre de minutes de jeu "attendues" pour une faute — en
// dessous, le score baisse ; au-dessus (ou 0 faute), il plafonne à 100.
const FOUL_MINUTES_REFERENCE = 6;
// Classement % LF : nombre de points marqués dans un match pour que ce match
// compte "à plein" dans le calcul — en dessous, il compte proportionnellement
// moins (jamais zéro), pour ne pas laisser un petit match diluer un vrai 9/10
// tout en ne l'effaçant pas non plus complètement.
const POINTS_WEIGHT_REFERENCE = 12;

function parseMinutesToSeconds(v) {
  if (!v) return null;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(String(v).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatSecondsAsMinutes(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function shortMatchDate(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

// Note du match, pour un objectif de {POINTS_WEIGHT_REFERENCE} points :
// moyenne entre l'adresse aux lancers francs (seul geste où on a à la fois
// les tentés ET les réussis) et les points marqués rapportés à l'objectif.
// Volontairement PAS plafonnée à 100% : un très gros match doit ressortir
// au-dessus, pas être écrasé au même niveau qu'un match pile dans l'objectif
// — on veut accentuer les matchs où la joueuse a surperformé, pas les lisser.
// Si aucun lancer franc n'a été tenté ce match-là, la note retombe
// entièrement sur les points marqués (rien à évaluer côté adresse).
function matchNote(ftMade, ftAtt, points) {
  const pointsRatio = (points / POINTS_WEIGHT_REFERENCE) * 100;
  if (ftAtt > 0) {
    const ftRatio = (ftMade / ftAtt) * 100;
    return (ftRatio + pointsRatio) / 2;
  }
  return pointsRatio;
}

// Agrège les lignes basketball_match_stats d'UNE joueuse sur l'ensemble des
// matchs joués retenus (déjà filtrés par phase(s) en amont) — en ignorant
// les matchs où elle était marquée absente de la feuille (on_sheet=false),
// qui ne doivent pas compter comme "un match à 0 sur toute la ligne".
function aggregatePlayerStats(playerId, statsRows, matchesById) {
  const rows = statsRows.filter((s) => s.player_id === playerId && s.on_sheet !== false);
  let ftMade = 0,
    ftAtt = 0,
    twoMade = 0,
    threeMade = 0,
    fouls = 0,
    starts = 0,
    totalSeconds = 0,
    gamesWithMinutes = 0;
  const perMatch = [];

  rows.forEach((s) => {
    const match = matchesById.get(s.match_id);
    if (!match) return;
    ftMade += s.ft_made ?? 0;
    ftAtt += s.ft_att ?? 0;
    twoMade += s.two_made ?? 0;
    threeMade += s.three_made ?? 0;
    fouls += s.fouls ?? 0;
    if (s.is_starting_five) starts += 1;
    const seconds = parseMinutesToSeconds(s.minutes_played);
    if (seconds != null) {
      totalSeconds += seconds;
      gamesWithMinutes += 1;
    }
    perMatch.push({
      matchId: s.match_id,
      date: match.match_date,
      points: (s.two_made ?? 0) * 2 + (s.three_made ?? 0) * 3 + (s.ft_made ?? 0),
      twoMade: s.two_made ?? 0,
      threeMade: s.three_made ?? 0,
      ftMade: s.ft_made ?? 0,
      ftAtt: s.ft_att ?? 0,
      fouls: s.fouls ?? 0,
      seconds,
      note: matchNote(s.ft_made ?? 0, s.ft_att ?? 0, (s.two_made ?? 0) * 2 + (s.three_made ?? 0) * 3 + (s.ft_made ?? 0)),
    });
  });

  perMatch.sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    gamesWithStats: rows.length,
    gamesWithMinutes,
    ftMade,
    ftAtt,
    twoMade,
    threeMade,
    fouls,
    starts,
    totalSeconds,
    totalPoints: twoMade * 2 + threeMade * 3 + ftMade,
    perMatch,
  };
}

function PlayerPicker({ players, selectedPlayerId, statsQueryBase }) {
  return (
    <div className="flex flex-wrap gap-2">
      {players.map((p) => (
        <Link
          key={p.id}
          href={`${statsQueryBase}&stats_player=${p.id}`}
          scroll={false}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            p.id === selectedPlayerId ? "bg-cardinal text-white" : "bg-white text-ink/50 shadow-sm hover:text-ink"
          }`}
        >
          {p.name}
          {p.is_self ? " ★" : ""}
        </Link>
      ))}
    </div>
  );
}

// Écran "Statistiques individuelles" : profil radar de la joueuse
// sélectionnée et ses graphiques d'évolution match après match (dont la
// note du match et sa comparaison aux points de l'équipe). Le classement
// entre joueuses (moyenne de la note de match) est dans StatsTab, à côté du
// bilan d'équipe.
function IndividualStatsSection({ players, playedMatches, statsRows, selectedPlayerId, statsQueryBase }) {
  if (players.length === 0) {
    return (
      <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
        Aucune joueuse dans l'effectif pour l'instant — ajoutes-en depuis une feuille de match.
      </div>
    );
  }

  const matchesById = new Map(playedMatches.map((m) => [m.id, m]));
  const perPlayer = players.map((p) => ({ player: p, agg: aggregatePlayerStats(p.id, statsRows, matchesById) }));

  // Total de points de l'équipe, match par match — toutes joueuses
  // confondues (hors absentes de la feuille), pour comparer chaque match de
  // la joueuse suivie au total de son équipe ce jour-là.
  const teamPointsByMatch = new Map();
  statsRows.forEach((s) => {
    if (s.on_sheet === false) return;
    const pts = (s.two_made ?? 0) * 2 + (s.three_made ?? 0) * 3 + (s.ft_made ?? 0);
    teamPointsByMatch.set(s.match_id, (teamPointsByMatch.get(s.match_id) ?? 0) + pts);
  });

  const teamTotalPoints = perPlayer.reduce((sum, x) => sum + x.agg.totalPoints, 0);
  const teamMaxAvgSeconds = Math.max(
    1,
    ...perPlayer.map((x) => (x.agg.gamesWithMinutes > 0 ? x.agg.totalSeconds / x.agg.gamesWithMinutes : 0))
  );

  const selected = perPlayer.find((x) => x.player.id === selectedPlayerId) ?? perPlayer[0];
  const { agg } = selected;

  const avgSeconds = agg.gamesWithMinutes > 0 ? agg.totalSeconds / agg.gamesWithMinutes : 0;
  const ftPct = agg.ftAtt > 0 ? (agg.ftMade / agg.ftAtt) * 100 : null;
  const avgFouls = agg.gamesWithStats > 0 ? agg.fouls / agg.gamesWithStats : 0;
  // Minutes de jeu par faute plutôt que fautes brutes : 4 fautes en 25 min
  // n'a rien à voir avec 4 fautes en 10 min (sortie prudente de
  // l'entraîneur) — 0 faute plafonne le score à 100 quel que soit le temps.
  const minutesPerFoul = agg.fouls > 0 ? agg.totalSeconds / 60 / agg.fouls : null;
  const disciplineScore = agg.fouls === 0 ? 100 : Math.min(100, ((minutesPerFoul ?? 0) / FOUL_MINUTES_REFERENCE) * 100);

  if (agg.gamesWithStats === 0) {
    return (
      <div className="space-y-4">
        <PlayerPicker players={players} selectedPlayerId={selected.player.id} statsQueryBase={statsQueryBase} />
        <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
          Pas encore de statistiques enregistrées pour {selected.player.name} sur les phases sélectionnées.
        </div>
      </div>
    );
  }

  const radarAxes = [
    { label: "Temps de jeu", value: (avgSeconds / teamMaxAvgSeconds) * 100 },
    { label: "% LF", value: ftPct ?? 0 },
    { label: "Discipline", value: disciplineScore },
    { label: "Titularisation", value: (agg.starts / agg.gamesWithStats) * 100 },
    { label: "Part des points équipe", value: teamTotalPoints > 0 ? (agg.totalPoints / teamTotalPoints) * 100 : 0 },
  ];

  const pointsSeries = agg.perMatch.map((m) => ({
    label: shortMatchDate(m.date),
    segments: [
      { value: m.twoMade * 2, className: "fill-[#2E86DE]" },
      { value: m.threeMade * 3, className: "fill-[#F5A623]" },
      { value: m.ftMade, className: "fill-[#16C79A]" },
    ],
  }));
  const foulsAndMinutesSeries = agg.perMatch.map((m) => ({
    label: shortMatchDate(m.date),
    barValue: m.fouls,
    lineValue: m.seconds != null ? m.seconds / 60 : null,
  }));

  // Note du match, match après match — le ton (vert-eau/bleu/corail) est
  // calculé directement par IsoBarChart à partir de la valeur.
  const noteSeries = agg.perMatch.map((m) => ({
    label: shortMatchDate(m.date),
    value: Math.round(m.note),
  }));

  // Même palette que IsoBarChart (vert-eau ≥100%, bleu 50-99%, corail <50%)
  // pour la bande de repère sous "Points par match" — un coup d'œil sur la
  // régularité, greffé sur le graphique existant plutôt qu'une carte à part.
  const noteTierColor = (value) => (value >= 100 ? "#16C79A" : value >= 50 ? "#2E86DE" : "#FF5A5F");
  const noteStrip = agg.perMatch.map((m) => ({
    color: noteTierColor(m.note),
    title: `${shortMatchDate(m.date)} — note : ${Math.round(m.note)}`,
  }));

  // Répartition des points marqués sur la saison (2 pts / 3 pts / LF) — une
  // photo d'ensemble en complément du détail match par match ci-dessus.
  const pointsBreakdown = [
    { label: "2 points", value: agg.twoMade * 2, color: "#2E86DE" },
    { label: "3 points", value: agg.threeMade * 3, color: "#F5A623" },
    { label: "Lancers francs", value: agg.ftMade, color: "#16C79A" },
  ];

  // Note moyenne selon que l'équipe a gagné ou perdu ce match-là — pour voir
  // si la joueuse est plus décisive dans les victoires ou si elle
  // sur-performe justement dans les matchs difficiles. us_is_team1 =
  // domicile, même convention FFBB que le reste de l'appli.
  const winNotes = [];
  const lossNotes = [];
  agg.perMatch.forEach((m) => {
    const match = matchesById.get(m.matchId);
    if (!match || match.us_is_team1 == null) return;
    const usScore = match.us_is_team1 ? match.team1_score : match.team2_score;
    const themScore = match.us_is_team1 ? match.team2_score : match.team1_score;
    if (usScore == null || themScore == null || usScore === themScore) return;
    (usScore > themScore ? winNotes : lossNotes).push(m.note);
  });
  const avgNote = (arr) => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const winLossSeries = [
    { label: `Victoires (${winNotes.length})`, value: Math.round(avgNote(winNotes)), className: "fill-[#16C79A]" },
    { label: `Défaites (${lossNotes.length})`, value: Math.round(avgNote(lossNotes)), className: "fill-[#FF5A5F]" },
  ];

  // Points de la joueuse vs points totaux de son équipe, match par match —
  // mêmes matchs que perMatch (donc déjà filtrés sur les phases retenues).
  const pointsVsTeamSeries = agg.perMatch.map((m) => ({
    label: shortMatchDate(m.date),
    a: m.points,
    b: teamPointsByMatch.get(m.matchId) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <PlayerPicker players={players} selectedPlayerId={selected.player.id} statsQueryBase={statsQueryBase} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-navy">Profil — {selected.player.name}</p>
          <RadarChart axes={radarAxes} />
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink/60">
            <div className="flex justify-between">
              <dt>Temps de jeu moy.</dt>
              <dd className="font-semibold text-ink">
                {agg.gamesWithMinutes > 0 ? formatSecondsAsMinutes(avgSeconds) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>LF</dt>
              <dd className="font-semibold text-ink">
                {agg.ftMade}/{agg.ftAtt}
                {ftPct != null ? ` (${ftPct.toFixed(0)}%)` : ""}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Fautes / match</dt>
              <dd className="font-semibold text-ink">{avgFouls.toFixed(1)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Titularisations</dt>
              <dd className="font-semibold text-ink">
                {agg.starts}/{agg.gamesWithStats}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Points saison</dt>
              <dd className="font-semibold text-ink">{agg.totalPoints}</dd>
            </div>
          </dl>
          <ChartInfo>
            <strong>Temps de jeu</strong> : moyenne de la joueuse rapportée à la moyenne la plus haute de l'équipe (100 =
            meilleur temps de jeu moyen de l'équipe). <strong>% LF</strong> : lancers francs réussis / tentés, cumulés
            sur la saison. <strong>Discipline</strong> : minutes de jeu par faute, rapportées à {FOUL_MINUTES_REFERENCE}{" "}
            min/faute (100 = au moins {FOUL_MINUTES_REFERENCE} min par faute, ou 0 faute) — 4 fautes en 25 min n'est
            pas noté pareil que 4 fautes en 10 min. <strong>Titularisation</strong> : part des matchs joués où elle
            était dans le cinq de départ. <strong>Part des points équipe</strong> : ses points / total des points de
            toute l'équipe sur la période.
          </ChartInfo>
        </div>

        <div className="rounded-card bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-navy">Points par match</p>
          <StackedBarChart
            items={pointsSeries}
            legend={[
              { label: "2 pts", className: "fill-[#2E86DE]" },
              { label: "3 pts", className: "fill-[#F5A623]" },
              { label: "LF", className: "fill-[#16C79A]" },
            ]}
            stripItems={noteStrip}
          />
          <ChartInfo>
            Paniers marqués par match (les tentatives à 2 et 3 points ne sont pas saisies en feuille de match, donc pas
            de % de réussite ici — seuls les lancers francs ont un vrai ratio réussi/tenté, affiché ailleurs). La
            bande de carrés sous les dates reprend la note du match (vert-eau ≥100%, bleu 50-99%, corail &lt;50% — voir
            "Note du match" plus bas) pour repérer la régularité d'un coup d'œil.
          </ChartInfo>
        </div>

        <div className="rounded-card bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-navy">Répartition des points (saison)</p>
          <DonutChart segments={pointsBreakdown} />
          <ChartInfo>
            Vue d'ensemble de la saison : sur tous les points marqués, la part venue des paniers à 2 points, à 3
            points et des lancers francs — un complément figé au détail match par match ci-contre.
          </ChartInfo>
        </div>

        <div className="rounded-card bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-navy">Note moyenne en victoire vs en défaite</p>
          <SimpleBarChart items={winLossSeries} />
          <ChartInfo>
            Moyenne de la note du match (voir "Note du match" plus bas), selon que l'équipe a gagné ou perdu ce
            jour-là — pour voir si {selected.player.name} est plus décisive dans les victoires ou si elle
            sur-performe justement dans les matchs difficiles. Les matchs nuls et ceux sans score connu ne sont pas
            comptés.
          </ChartInfo>
        </div>

        <div className="rounded-card bg-white p-4 shadow-sm sm:col-span-2">
          <p className="mb-2 text-sm font-semibold text-navy">Fautes vs temps de jeu</p>
          <BarLineChart
            items={foulsAndMinutesSeries}
            barLabel="Fautes"
            barColorClass="fill-[#FF5A5F]"
            lineLabel="Temps de jeu (min)"
            lineStrokeClass="stroke-[#2E86DE]"
            lineFillClass="fill-[#2E86DE]"
            lineDotClass="bg-[#2E86DE]"
            thresholdValue={5}
            thresholdLabel="Sortie (5 fautes)"
          />
          <ChartInfo>
            Le temps de jeu (ligne) est déjà visible ici superposé aux fautes (barres) du même match — inutile de le
            répéter dans un graphique à part. 4 fautes en 25 min de jeu n'est pas comparable à 4 fautes en 10 min
            (souvent une sortie prudente de l'entraîneur) ; c'est ce ratio (minutes de jeu par faute) qui alimente
            aussi l'axe "Discipline" du radar.
          </ChartInfo>
        </div>

        <div className="rounded-card bg-white p-4 shadow-sm sm:col-span-2">
          <p className="mb-2 text-sm font-semibold text-navy">
            Note du match — objectif {POINTS_WEIGHT_REFERENCE} points
          </p>
          <IsoBarChart items={noteSeries} thresholdValue={100} thresholdLabel="Objectif atteint" />
          <ChartInfo>
            (% de réussite aux lancers francs + points marqués / {POINTS_WEIGHT_REFERENCE}) / 2, match par match.
            Volontairement pas plafonnée à 100% : un très gros match ressort au-dessus plutôt que d'être lissé au même
            niveau qu'un match pile dans l'objectif. Sans lancer franc tenté ce match-là, la note retombe entièrement
            sur les points marqués. Barre turquoise = au-dessus de l'objectif, bleue = dans une bonne moyenne, corail
            = match difficile.
          </ChartInfo>
        </div>

        <div className="rounded-card bg-white p-4 shadow-sm sm:col-span-2">
          <p className="mb-2 text-sm font-semibold text-navy">Points de la joueuse vs points de l'équipe</p>
          <DualLineChart
            items={pointsVsTeamSeries}
            seriesA={{ label: selected.player.name, strokeClass: "stroke-[#FF5A5F]", fillClass: "fill-[#FF5A5F]", dotClass: "bg-[#FF5A5F]" }}
            seriesB={{ label: "Total équipe", strokeClass: "stroke-[#2E86DE]/50", fillClass: "fill-[#2E86DE]/50", dotClass: "bg-[#2E86DE]/50" }}
          />
          <ChartInfo>
            Points marqués par {selected.player.name} comparés au total marqué par toute l'équipe, match par match —
            pour voir sa part dans la performance collective au fil de la saison plutôt qu'un seul total cumulé.
          </ChartInfo>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <tr className="border-b border-ink/5 last:border-0">
      <td className="px-4 py-2 text-sm text-ink/60">{label}</td>
      <td className="px-4 py-2 text-right font-display text-sm font-bold text-navy">{value}</td>
    </tr>
  );
}

function StatsTab({
  playedMatches,
  phases,
  selectedStatsPhaseIds,
  selectedPsId,
  scope,
  selectedSeason,
  selectedPhase,
  statsPlayers,
  statsRows,
  selectedPlayerId,
  statsQueryBase,
  statsMatchFocus,
}) {
  const stats = computeTeamStats(playedMatches);

  // Note moyenne à domicile vs à l'extérieur, par joueuse — remplace
  // l'ancien "Classement % LF" (illisible) par quelque chose qui raconte une
  // vraie histoire plutôt qu'un simple ordre. us_is_team1 = domicile, par la
  // même convention que le reste de l'appli (équipe 1 = domicile côté FFBB).
  const matchesById = new Map(playedMatches.map((m) => [m.id, m]));
  const noteRanking = statsPlayers
    .map((p) => {
      const agg = aggregatePlayerStats(p.id, statsRows, matchesById);
      if (agg.perMatch.length === 0) return null;
      const home = agg.perMatch.filter((m) => matchesById.get(m.matchId)?.us_is_team1 === true);
      const away = agg.perMatch.filter((m) => matchesById.get(m.matchId)?.us_is_team1 === false);
      const avg = (rows) => (rows.length > 0 ? rows.reduce((sum, m) => sum + m.note, 0) / rows.length : 0);
      return { label: p.name, left: avg(home), right: avg(away), highlight: p.id === selectedPlayerId };
    })
    .filter(Boolean)
    .sort((a, b) => b.left + b.right - (a.left + a.right));

  return (
    <div className="space-y-4">
      <p className="rounded-card bg-lagoon-light p-3 text-xs text-navy">
        La FFBB (fédération, championnats amateurs) ne publie pas de statistiques joueur par joueur —
        c'est la LNB, qui gère le Betclic Elite (une ligue professionnelle à part), qui a son propre
        système de stats. Ici, un bilan calculé à partir des matchs de l'équipe.
      </p>

      {/* En mode "focus sur un match" (ouvert depuis l'icône stats d'une
          feuille de match), on remplace le filtre par phases — qui n'a pas
          de sens pour un seul match — par un résumé de ce match. */}
      {statsMatchFocus ? (
        <div className="rounded-card bg-white p-3 text-sm shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Statistiques du match</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-base uppercase tracking-tight text-navy">
              <span className={statsMatchFocus.us_is_team1 === true ? "font-bold" : ""}>
                {statsMatchFocus.team1_name || "Équipe inconnue"}
              </span>
              <span className="mx-2 text-ink/30">vs</span>
              <span className={statsMatchFocus.us_is_team1 === false ? "font-bold" : ""}>
                {statsMatchFocus.team2_name || "Équipe inconnue"}
              </span>
              {statsMatchFocus.status === "joue" && (
                <span className="ml-2 text-ink/50">
                  ({statsMatchFocus.team1_score ?? "–"} - {statsMatchFocus.team2_score ?? "–"})
                </span>
              )}
            </p>
            <p className="text-xs text-ink/50">
              {statsMatchFocus.match_date ? formatDateTime(statsMatchFocus.match_date) : "Date à confirmer"}
              {statsMatchFocus.location ? ` · ${statsMatchFocus.location}` : ""}
            </p>
          </div>
        </div>
      ) : (
        /* Filtre global à tout le module (équipe ET individuelles) : formulaire
           GET natif, aucun JS nécessaire. stats_filtered=1 permet de
           distinguer "aucune phase cochée par choix explicite" du premier
           affichage (où toutes les phases comptent par défaut). */
        phases.length > 1 && (
          <form
            method="get"
            action="/basket"
            className="flex flex-wrap items-center gap-3 rounded-card bg-white p-3 text-sm shadow-sm"
          >
            <input type="hidden" name="ps" value={selectedPsId} />
            <input type="hidden" name="tab" value="stats" />
            <input type="hidden" name="scope" value={scope} />
            <input type="hidden" name="season" value={selectedSeason} />
            {selectedPhase?.id && <input type="hidden" name="phase" value={selectedPhase.id} />}
            {selectedPlayerId && <input type="hidden" name="stats_player" value={selectedPlayerId} />}
            <input type="hidden" name="stats_filtered" value="1" />
            <span className="font-semibold text-ink/50">Phases incluses :</span>
            {phases.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="stats_phase"
                  value={p.id}
                  defaultChecked={selectedStatsPhaseIds.includes(p.id)}
                className="h-4 w-4"
              />
              {p.phase_name}
            </label>
          ))}
          <button
            type="submit"
            className="rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white hover:bg-navy-light"
          >
            Appliquer
          </button>
        </form>
        )
      )}

      <details open className="space-y-4">
        <summary className="cursor-pointer text-sm font-semibold text-navy">Statistiques équipe</summary>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
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

          <div className="rounded-card bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold text-navy">
              Note moyenne domicile vs extérieur — objectif {POINTS_WEIGHT_REFERENCE} pts/match
            </p>
            {noteRanking.length === 0 ? (
              <p className="text-xs text-ink/40">Pas encore de statistiques par joueuse.</p>
            ) : (
              <PyramidChart items={noteRanking} leftLabel="Domicile" rightLabel="Extérieur" valueSuffix="%" />
            )}
            <ChartInfo>
              Moyenne, sur tous les matchs joués et saisis, de la note de chaque match (voir son détail de calcul dans
              "Statistiques individuelles" ci-dessous) — à domicile à gauche, à l'extérieur à droite, pour repérer si
              une joueuse est plus à l'aise chez elle ou en déplacement plutôt que juste un ordre de classement.
            </ChartInfo>
          </div>
        </div>
      </details>

      <details open className="space-y-3">
        <summary className="cursor-pointer text-sm font-semibold text-navy">Statistiques individuelles</summary>
        <div className="mt-3">
          <IndividualStatsSection
            players={statsPlayers}
            playedMatches={playedMatches}
            statsRows={statsRows}
            selectedPlayerId={selectedPlayerId}
            statsQueryBase={statsQueryBase}
          />
        </div>
      </details>
    </div>
  );
}

// Feuille de match complète — remplace toute la page quand ?feuille=<id> est
// présent dans l'URL. Ouverte en cliquant sur la date ou le score d'un match
// dans le calendrier. Le score officiel FFBB (s'il y en a un) n'est jamais
// modifiable ici ; seuls les quarts-temps/notes et les statistiques par
// joueuse le sont. Pour un match manuel (amical), le score total ET le
// statut joué/à venir sont recalculés depuis les quarts-temps saisis.
// Champs communs à "Nouvelle joueuse" et à la modification d'une fiche
// existante — un seul jeu de champs, pré-rempli via defaultValue quand
// `player` est fourni. Le rôle choisi détermine, côté serveur (addPlayer /
// updatePlayer), quels champs sont réellement conservés.
function PlayerFormFields({ defaultClub, participantFirstName, player }) {
  const role = player?.role === "entraineur" ? "entraineur" : "joueur";
  return (
    <>
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="role" value="joueur" defaultChecked={role === "joueur"} className="h-4 w-4" />
          Joueuse
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="role"
            value="entraineur"
            defaultChecked={role === "entraineur"}
            className="h-4 w-4"
          />
          Entraîneur·e
        </label>
      </div>

      {participantFirstName && (
        <label className="flex items-center gap-1.5 text-sm text-ink/60">
          <input type="checkbox" name="is_self" defaultChecked={player?.is_self ?? false} className="h-4 w-4" />
          {`C'est ${participantFirstName} elle-même (utilisée par défaut dans les statistiques individuelles)`}
        </label>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          name="last_name"
          defaultValue={player?.last_name ?? ""}
          placeholder="Nom *"
          required
          className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
        />
        <input
          name="first_name"
          defaultValue={player?.first_name ?? ""}
          placeholder="Prénom *"
          required
          className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
        />
        <input
          name="licence_number"
          defaultValue={player?.licence_number ?? ""}
          placeholder="N° licence"
          className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
        />
        <input
          name="national_number"
          defaultValue={player?.national_number ?? ""}
          placeholder="N° national"
          className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
        />
        <input
          name="licence_type"
          defaultValue={player?.licence_type ?? ""}
          placeholder="Type de licence"
          className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
        />
        <input
          name="club"
          defaultValue={player?.club ?? defaultClub}
          placeholder="Club"
          className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
        />
      </div>

      <label className="flex items-center gap-1.5 text-sm text-ink/60">
        <input
          type="checkbox"
          name="licence_not_presented"
          defaultChecked={player?.licence_not_presented ?? false}
          className="h-4 w-4"
        />
        Licence non présentée
      </label>

      <div className="grid gap-2 border-t border-ink/10 pt-2 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">Si joueuse</p>
          <input
            type="number"
            name="jersey_number"
            defaultValue={player?.jersey_number ?? ""}
            placeholder="N° de maillot"
            className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
          />
          <input
            name="surclassement"
            defaultValue={player?.surclassement ?? ""}
            placeholder="Surclassement (ex. Aucun, 1 an, 2 ans)"
            className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1.5 text-sm text-ink/60">
            <input
              type="checkbox"
              name="is_default_captain"
              defaultChecked={player?.is_default_captain ?? false}
              className="h-4 w-4"
            />
            Capitaine habituelle
          </label>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">Si entraîneur·e</p>
          <input
            name="diplome"
            defaultValue={player?.diplome ?? ""}
            placeholder="Diplôme"
            className="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1.5 text-sm text-ink/60">
            <input
              type="checkbox"
              name="is_adjoint"
              defaultChecked={player?.is_adjoint ?? false}
              className="h-4 w-4"
            />
            Adjoint
          </label>
        </div>
      </div>
    </>
  );
}

async function MatchSheetPage({ matchId, backHref }) {
  const supabase = createClient();

  const { data: match } = await supabase
    .from("basketball_matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) {
    return (
      <div className="space-y-4">
        <Link href={backHref} className="inline-block text-sm font-semibold text-navy hover:text-cardinal">
          ← Retour au calendrier
        </Link>
        <div className="rounded-card bg-white p-6 text-center text-sm text-ink/50 shadow-sm">
          Ce match n'existe plus.
        </div>
      </div>
    );
  }

  // Lien vers l'écran Statistiques, en mode "focus sur ce match" — repart des
  // mêmes paramètres que le retour au calendrier (participant, saison,
  // phase...) mais bascule sur l'onglet stats et ajoute stats_match.
  const backParams = new URLSearchParams(backHref.split("?")[1] || "");
  const statsParams = new URLSearchParams(backParams);
  statsParams.set("tab", "stats");
  statsParams.set("stats_match", match.id);
  statsParams.delete("journee");
  statsParams.delete("journees");
  const statsHref = `/basket?${statsParams.toString()}`;

  const [{ data: phase }, { data: ps }, { data: allPeople }, { data: statsRows }] = await Promise.all([
    match.phase_id
      ? supabase
          .from("basketball_phases")
          .select("phase_name, competition_name, poule_label, our_team_name")
          .eq("id", match.phase_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("participant_sports")
      .select("club, participants(first_name)")
      .eq("id", match.participant_sport_id)
      .maybeSingle(),
    supabase
      .from("basketball_players")
      .select("*")
      .eq("participant_sport_id", match.participant_sport_id)
      .order("name", { ascending: true }),
    supabase.from("basketball_match_stats").select("*").eq("match_id", matchId),
  ]);

  const players = (allPeople ?? []).filter((p) => p.role !== "entraineur");
  const staff = (allPeople ?? []).filter((p) => p.role === "entraineur");
  const defaultClub = phase?.our_team_name || ps?.club || "";
  const participantFirstName = ps?.participants?.first_name || "";

  const statsByPlayer = new Map((statsRows ?? []).map((s) => [s.player_id, s]));
  // Une joueuse est sur la feuille par défaut (on_sheet absent ou true) —
  // seul un retrait explicite (absence ponctuelle) l'en exclut, sans jamais
  // la supprimer de l'effectif ni de ses stats sur les autres matchs.
  const sheetPlayers = players.filter((p) => statsByPlayer.get(p.id)?.on_sheet !== false);
  const excludedPlayers = players.filter((p) => statsByPlayer.get(p.id)?.on_sheet === false);
  const isPlayed = match.status === "joue";
  const usIsLeft = match.us_is_team1 === true;
  const usIsRight = match.us_is_team1 === false;
  const leftName = match.team1_name || "Équipe inconnue";
  const rightName = match.team2_name || "Équipe inconnue";
  const report = match.match_report;
  const isManual = match.source === "manuel";

  const pointsFor = (s) => (s ? s.two_made * 2 + s.three_made * 3 + s.ft_made : 0);
  const totalTeamPoints = sheetPlayers.reduce((sum, p) => sum + pointsFor(statsByPlayer.get(p.id)), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className="inline-block text-sm font-semibold text-navy hover:text-cardinal">
          ← Retour au calendrier
        </Link>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isManual ? "bg-sand text-ink/60" : "bg-lagoon-light text-navy"
            }`}
          >
            {isManual ? "🤝 Manuel" : "🔄 Synchronisé"}
          </span>
          <form action={resetMatchSheet}>
            <input type="hidden" name="match_id" value={match.id} />
            <ConfirmSubmitButton
              confirmMessage="Réinitialiser cette feuille de match ? Quarts-temps, notes et statistiques par joueuse seront effacés (l'effectif de l'équipe n'est pas touché). Cette action est irréversible."
              className="text-xs font-semibold text-ink/40 hover:text-cardinal"
            >
              Réinitialiser la feuille
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      {!isManual && (
        <p className="text-xs text-ink/40">
          Ce match est synchronisé depuis la FFBB : la date, le lieu et le score officiel seront
          remis à jour à chaque synchro. Seules la feuille de match et les statistiques par joueuse,
          saisies ici, ne sont jamais écrasées.
        </p>
      )}

      <div className="rounded-card bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
          {phase?.competition_name || phase?.phase_name || "Match"}
          {phase?.poule_label ? ` · ${phase.poule_label}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-xl uppercase tracking-tight text-navy">
            <span className={usIsLeft ? "font-bold" : ""}>{leftName}</span>
            <span className="mx-2 text-ink/30">vs</span>
            <span className={usIsRight ? "font-bold" : ""}>{rightName}</span>
          </h1>
          <p className="text-sm text-ink/50">{match.location || "Lieu inconnu"}</p>
        </div>
        <p className="mt-1 text-sm text-ink/50">
          {match.match_date ? formatDateTime(match.match_date) : "Date à confirmer"}
        </p>
      </div>

      <div className="rounded-card bg-white p-5 shadow-sm">
        <p className="font-display text-sm uppercase tracking-tight text-navy">Score</p>

        {!isManual && (
          <p className="mt-1 text-xs text-ink/40">
            Score officiel FFBB — {isPlayed ? `${match.team1_score ?? "–"} - ${match.team2_score ?? "–"}` : "match non joué"}.
            Les quarts-temps ci-dessous sont juste indicatifs, ils ne changent pas le score officiel.
          </p>
        )}

        <form action={saveMatchSheet} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="hidden" name="match_id" value={match.id} />
          {[1, 2, 3, 4].map((q) => (
            <div key={q} className="flex flex-col gap-1">
              <span className="text-[10px] uppercase text-ink/40">Quart-temps {q}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  name={`q${q}_us`}
                  defaultValue={report?.quarters?.[q - 1]?.us ?? ""}
                  placeholder={usIsLeft ? leftName : rightName}
                  className="w-16 rounded-lg border border-ink/15 px-2 py-1 text-sm"
                />
                <span className="text-ink/30">-</span>
                <input
                  type="number"
                  min="0"
                  name={`q${q}_them`}
                  defaultValue={report?.quarters?.[q - 1]?.them ?? ""}
                  placeholder="Adv."
                  className="w-16 rounded-lg border border-ink/15 px-2 py-1 text-sm"
                />
              </div>
            </div>
          ))}

          {isManual && (
            <label className="col-span-2 flex items-center gap-2 text-sm text-ink/60 sm:col-span-4">
              <input type="checkbox" name="played" defaultChecked={isPlayed} className="h-4 w-4" />
              Match joué (le score total est recalculé depuis les quarts-temps ci-dessus)
            </label>
          )}

          <textarea
            name="notes"
            defaultValue={report?.notes ?? ""}
            placeholder="Notes (arbitre, ambiance, faits marquants...)"
            rows={2}
            className="col-span-2 rounded-lg border border-ink/15 px-2 py-1.5 text-sm sm:col-span-4"
          />

          <button
            type="submit"
            className="col-span-2 rounded-full bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy-light sm:col-span-1 sm:w-fit"
          >
            Enregistrer
          </button>
        </form>
      </div>

      <div className="rounded-card bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="font-display text-sm uppercase tracking-tight text-navy">Feuille de match — joueuses</p>
            <Link
              href={statsHref}
              title="Voir les statistiques de ce match"
              aria-label="Voir les statistiques de ce match"
              className="text-navy/50 hover:text-cardinal"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" />
                <rect x="10" y="7" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" />
              </svg>
            </Link>
          </div>
          <p className="text-xs text-ink/40">Total calculé : {totalTeamPoints} pts</p>
        </div>

        {players.length === 0 ? (
          <p className="mt-3 text-sm text-ink/50">Aucune joueuse dans l'effectif — ajoute-en une ci-dessous.</p>
        ) : (
          <form action={saveMatchStats} className="mt-3 overflow-x-auto">
            <input type="hidden" name="match_id" value={match.id} />
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-[10px] uppercase tracking-wide text-ink/40">
                  <th className="py-1.5 pr-2">Joueuse</th>
                  <th className="px-1.5 text-center">Cap.</th>
                  <th className="px-1.5 text-center">5 majeur</th>
                  <th className="px-1.5 text-center">Temps (MM:SS)</th>
                  <th className="px-1.5 text-center">Fautes</th>
                  <th className="px-1.5 text-center">LF (réuss./tent.)</th>
                  <th className="px-1.5 text-center">2 pts marqués</th>
                  <th className="px-1.5 text-center">3 pts marqués</th>
                  <th className="px-1.5 text-center">Pts</th>
                  <th className="px-1.5 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {sheetPlayers.map((p) => {
                  const s = statsByPlayer.get(p.id);
                  return (
                    <tr key={p.id} className="border-b border-ink/5 last:border-0">
                      <td className="py-1.5 pr-2 font-semibold text-ink">
                        {p.jersey_number != null ? `#${p.jersey_number} ` : ""}
                        {p.name}
                        <input type="hidden" name="player_id" value={p.id} />
                      </td>
                      <td className="px-1.5 text-center">
                        <input
                          type="checkbox"
                          name={`captain_${p.id}`}
                          defaultChecked={s?.is_captain ?? false}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-1.5 text-center">
                        <input
                          type="checkbox"
                          name={`starting_${p.id}`}
                          defaultChecked={s?.is_starting_five ?? false}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-1.5">
                        <input
                          type="text"
                          name={`minutes_${p.id}`}
                          defaultValue={s?.minutes_played ?? ""}
                          placeholder="MM:SS"
                          pattern="^[0-9]{1,3}:[0-5][0-9]$"
                          title="Format MM:SS, ex. 12:30"
                          className="w-20 rounded-lg border border-ink/15 px-1 py-1 text-center"
                        />
                      </td>
                      <td className="px-1.5">
                        <input
                          type="number"
                          min="0"
                          name={`fouls_${p.id}`}
                          defaultValue={s?.fouls ?? 0}
                          className="w-14 rounded-lg border border-ink/15 px-1 py-1 text-center"
                        />
                      </td>
                      <td className="px-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            name={`ft_made_${p.id}`}
                            defaultValue={s?.ft_made ?? 0}
                            className="w-12 rounded-lg border border-ink/15 px-1 py-1 text-center"
                          />
                          <span className="text-ink/30">/</span>
                          <input
                            type="number"
                            min="0"
                            name={`ft_att_${p.id}`}
                            defaultValue={s?.ft_att ?? 0}
                            className="w-12 rounded-lg border border-ink/15 px-1 py-1 text-center"
                          />
                        </div>
                      </td>
                      <td className="px-1.5">
                        <input
                          type="number"
                          min="0"
                          name={`two_made_${p.id}`}
                          defaultValue={s?.two_made ?? 0}
                          title="Nombre de paniers à 2 points marqués"
                          className="w-14 rounded-lg border border-ink/15 px-1 py-1 text-center"
                        />
                      </td>
                      <td className="px-1.5">
                        <input
                          type="number"
                          min="0"
                          name={`three_made_${p.id}`}
                          defaultValue={s?.three_made ?? 0}
                          title="Nombre de paniers à 3 points marqués"
                          className="w-14 rounded-lg border border-ink/15 px-1 py-1 text-center"
                        />
                      </td>
                      <td className="px-1.5 text-center font-display font-bold text-navy">{pointsFor(s)}</td>
                      <td className="px-1.5 text-center">
                        <button
                          type="submit"
                          form={`remove-${p.id}`}
                          title="Marquer absente pour ce match"
                          className="text-ink/30 hover:text-cardinal"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              type="submit"
              className="mt-3 rounded-full bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy-light"
            >
              Enregistrer les statistiques
            </button>
          </form>
        )}

        {/* Un <form> par joueuse retirable, en dehors du <form> principal des
            statistiques (les formulaires HTML ne s'imbriquent pas) — reliés
            à leur bouton respectif via l'attribut form=. */}
        {sheetPlayers.map((p) => (
          <form key={p.id} id={`remove-${p.id}`} action={togglePlayerOnSheet} className="hidden">
            <input type="hidden" name="match_id" value={match.id} />
            <input type="hidden" name="player_id" value={p.id} />
            <input type="hidden" name="on_sheet" value="false" />
          </form>
        ))}

        {excludedPlayers.length > 0 && (
          <div className="mb-3 mt-3 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-3">
            <p className="text-xs text-ink/40">Absentes pour ce match :</p>
            {excludedPlayers.map((p) => (
              <form
                key={p.id}
                action={togglePlayerOnSheet}
                className="flex items-center gap-1 rounded-full bg-sand px-2 py-1 text-xs"
              >
                <input type="hidden" name="match_id" value={match.id} />
                <input type="hidden" name="player_id" value={p.id} />
                <input type="hidden" name="on_sheet" value="true" />
                <span>{p.name}</span>
                <button type="submit" className="font-semibold text-ink/30 hover:text-navy" title="Réintégrer à la feuille">
                  +
                </button>
              </form>
            ))}
          </div>
        )}

        {staff.length > 0 && (
          <div className="mt-4 border-t border-ink/5 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Encadrement</p>
            <ul className="space-y-1 text-sm text-ink/70">
              {staff.map((p) => (
                <li key={p.id}>
                  {p.name}
                  {p.diplome ? ` — ${p.diplome}` : ""}
                  {p.is_adjoint ? " (adjoint)" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 border-t border-ink/5 pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Effectif</p>
            <p className="text-[11px] text-ink/40">Clique sur une joueuse pour la modifier ou la supprimer.</p>
          </div>

          {/* Chaque pill ouvre sa propre fiche (mêmes champs que "Nouvelle
              joueuse", pré-remplis) — plus de suppression en un clic direct
              sur la pill : ça évite l'effacement accidentel d'une joueuse
              (et de toutes ses stats, sur tous les matchs) signalé
              précédemment. La suppression reste possible, mais seulement
              depuis cette fiche, avec confirmation. */}
          <div className="flex flex-wrap gap-2">
            {(allPeople ?? []).map((p) => (
              <details key={p.id}>
                <summary className="inline-block cursor-pointer list-none rounded-full bg-sand px-3 py-1 text-xs font-semibold text-ink hover:bg-sand-dark">
                  {p.name}
                  {p.role === "entraineur" ? " (entraîneur)" : ""}
                </summary>

                <div className="mt-2 space-y-3 rounded-lg bg-sand p-3">
                  <form action={updatePlayer} className="space-y-2">
                    <input type="hidden" name="player_id" value={p.id} />
                    <PlayerFormFields defaultClub={defaultClub} participantFirstName={participantFirstName} player={p} />
                    <button
                      type="submit"
                      className="rounded-full bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy-light"
                    >
                      Enregistrer
                    </button>
                  </form>

                  <form action={deletePlayer} className="border-t border-ink/10 pt-2">
                    <input type="hidden" name="player_id" value={p.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Supprimer « ${p.name} » de l'effectif ? Ses statistiques sur TOUS les matchs seront perdues définitivement. Cette action est irréversible.`}
                      className="text-xs font-semibold text-cardinal hover:text-cardinal-dark"
                    >
                      Supprimer de l'effectif
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </details>
            ))}
          </div>

          <details className="mt-3">
            <summary className="inline-block cursor-pointer list-none rounded-full bg-cardinal px-4 py-1.5 text-sm font-semibold text-white hover:bg-cardinal-dark">
              + Nouvelle joueuse
            </summary>
            <form action={addPlayer} className="mt-3 space-y-2 rounded-lg bg-sand p-3">
              <input type="hidden" name="participant_sport_id" value={match.participant_sport_id} />
              <PlayerFormFields defaultClub={defaultClub} participantFirstName={participantFirstName} />
              <button
                type="submit"
                className="rounded-full bg-cardinal px-4 py-1.5 text-sm font-semibold text-white hover:bg-cardinal-dark"
              >
                Ajouter à l'effectif
              </button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}

export default async function BasketPage({ searchParams }) {
  const supabase = createClient();

  // La feuille de match remplace tout le contenu de la page tant qu'elle est
  // ouverte — on garde tous les autres paramètres d'URL (participant, saison,
  // phase, journée...) pour revenir exactement là d'où on vient.
  if (searchParams?.feuille) {
    const backParams = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (key !== "feuille" && typeof value === "string") backParams.set(key, value);
    });
    return <MatchSheetPage matchId={searchParams.feuille} backHref={`/basket?${backParams.toString()}`} />;
  }

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
  const journeesMode = searchParams?.journees === "toutes" ? "toutes" : "une";

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

  // Phases de la saison sélectionnée (ex. Saison régulière / Phase 2 /
  // Phase 3) — chacune a son propre ID FFBB et sa propre poule.
  let phases = [];
  if (selectedPsId) {
    const { data: phaseRows } = await supabase
      .from("basketball_phases")
      .select("*")
      .eq("participant_sport_id", selectedPsId)
      .eq("season", selectedSeason)
      .order("position", { ascending: true });
    phases = phaseRows ?? [];
  }
  const selectedPhase =
    phases.find((p) => p.id === searchParams?.phase) ?? phases[0] ?? null;

  // Icône affichée devant chaque match du calendrier : le badge du niveau de
  // compétition récupéré à la synchro pour une phase FFBB, un simple
  // pictogramme pour une phase de matchs amicaux (pas d'asset FFBB associé).
  const phaseTypeIcon =
    selectedPhase?.phase_type === "amical"
      ? "🤝"
      : selectedPhase?.competition_logo_asset
        ? ffbbAssetUrl(selectedPhase.competition_logo_asset, { width: 64 })
        : null;

  let matches = [];
  let classement = [];
  if (selectedPhase) {
    const { data: matchRows } = await supabase
      .from("basketball_matches")
      .select("*")
      .eq("phase_id", selectedPhase.id)
      .order("match_date", { ascending: true });
    matches = matchRows ?? [];

    const { data: classementRows } = await supabase
      .from("basketball_classements")
      .select("*")
      .eq("phase_id", selectedPhase.id);
    classement = classementRows ?? [];
  }

  // Les stats/le bilan d'équipe ne concernent toujours QUE notre équipe,
  // indépendamment du bouton "Sathonay Camp / Toute la poule" (qui ne filtre
  // que le calendrier) — et, contrairement au calendrier/classement, portent
  // sur TOUTES les phases de la saison par défaut (le calendrier/classement,
  // eux, restent scopés à la phase choisie dans PhaseBar).
  const allPhaseIds = phases.map((p) => p.id);
  let seasonMatches = [];
  if (allPhaseIds.length > 0) {
    const { data: seasonMatchRows } = await supabase
      .from("basketball_matches")
      .select("*")
      .in("phase_id", allPhaseIds)
      .order("match_date", { ascending: true });
    seasonMatches = seasonMatchRows ?? [];
  }
  const rawStatsPhase = searchParams?.stats_phase;
  const statsPhaseParam =
    rawStatsPhase == null ? [] : Array.isArray(rawStatsPhase) ? rawStatsPhase : [rawStatsPhase];
  // stats_filtered=1 distingue "l'utilisateur a soumis le formulaire, quitte
  // à tout décocher" du premier affichage (pas encore de choix) — dans ce
  // second cas seulement, toutes les phases comptent par défaut.
  const selectedStatsPhaseIds = searchParams?.stats_filtered === "1" ? statsPhaseParam : allPhaseIds;
  const statsMatches = seasonMatches.filter((m) => selectedStatsPhaseIds.includes(m.phase_id));
  // Ouvert depuis l'icône "Statistiques" d'une feuille de match précise : on
  // ignore alors le filtre par phases et on ne garde QUE ce match — le
  // bandeau habituel est remplacé par un résumé de ce match (voir plus bas).
  const statsMatchId = searchParams?.stats_match || null;
  const statsMatchFocus = statsMatchId ? (seasonMatches.find((m) => m.id === statsMatchId) ?? null) : null;
  const playedMatches = statsMatchFocus
    ? [statsMatchFocus].filter((m) => m.us_is_team1 !== null && m.status === "joue")
    : statsMatches.filter((m) => m.us_is_team1 !== null && m.status === "joue");
  const scopedMatches = scope === "poule" ? matches : matches.filter((m) => m.us_is_team1 !== null);

  // Table des clubs (logos/gymnase/adresse) — partagée entre toutes les
  // équipes et saisons, chargée uniquement pour l'onglet Calendrier.
  let clubLogos = new Map();
  if (tab === "calendrier") {
    const { data: clubRows } = await supabase.from("basketball_clubs").select("club_key, logo_asset, logo_url");
    clubLogos = new Map((clubRows ?? []).map((c) => [c.club_key, c]));
  }

  // Effectif + statistiques par joueuse — uniquement chargés pour l'onglet
  // Statistiques (inutile ailleurs), pour la sélection par défaut de la
  // joueuse dans "Statistiques individuelles" (elle-même en priorité).
  let statsPlayers = [];
  let statsRows = [];
  if (tab === "stats" && selectedPsId) {
    const { data: playersData } = await supabase
      .from("basketball_players")
      .select("*")
      .eq("participant_sport_id", selectedPsId)
      .eq("role", "joueur")
      .order("name", { ascending: true });
    statsPlayers = playersData ?? [];

    const playedMatchIds = playedMatches.map((m) => m.id);
    if (playedMatchIds.length > 0) {
      const { data: statsData } = await supabase
        .from("basketball_match_stats")
        .select("*")
        .in("match_id", playedMatchIds);
      statsRows = statsData ?? [];
    }
  }
  const selectedPlayerId =
    (searchParams?.stats_player && statsPlayers.some((p) => p.id === searchParams.stats_player)
      ? searchParams.stats_player
      : statsPlayers.find((p) => p.is_self)?.id ?? statsPlayers[0]?.id) ?? null;
  const statsPhaseQS = selectedStatsPhaseIds.map((id) => `stats_phase=${id}`).join("&");
  const statsQueryBase = `/basket?ps=${selectedPsId}&tab=stats&scope=${scope}&season=${encodeURIComponent(selectedSeason)}&phase=${selectedPhase?.id ?? ""}&stats_filtered=1&${statsPhaseQS}`;

  const journeeOptions = buildJourneeOptions(scopedMatches);
  const selectedJournee = searchParams?.journee || defaultJournee(scopedMatches, journeeOptions);
  // Repris sur tous les liens de nav (onglets, bascule Sathonay/poule,
  // pastilles de phase) pour que changer d'onglet ou de vue ne fasse jamais
  // revenir sur "Une journée" si "Toutes" était sélectionné.
  const journeeQS = `&journees=${journeesMode}${journeesMode === "une" && selectedJournee ? `&journee=${encodeURIComponent(selectedJournee)}` : ""}`;

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
            <div className="flex items-center gap-2">
              <form action={resetCurrentSeason}>
                <input type="hidden" name="participant_sport_id" value={selectedPsId} />
                <ConfirmSubmitButton
                  confirmMessage={`Supprimer tous les matchs et le classement de la saison ${currentSeason} pour ${
                    selectedPs?.club || "cette équipe"
                  } ? Les autres saisons (archives) ne sont pas concernées. Cette action est irréversible.`}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink/50 shadow-sm hover:text-cardinal"
                >
                  Réinitialiser
                </ConfirmSubmitButton>
              </form>
              <SeasonSelect
                seasons={seasonOptions}
                value={selectedSeason}
                basePath={`/basket?ps=${selectedPsId}&tab=${tab}&scope=${scope}`}
              />
            </div>
          </div>

          {!isCurrentSeason && (
            <div className="rounded-card bg-sand p-4 text-sm text-ink/60 shadow-sm">
              Saison {selectedSeason} — archive en lecture seule. La synchronisation FFBB ne concerne que
              la saison en cours ({currentSeason}).
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/basket?ps=${selectedPsId}&tab=calendrier&scope=${scope}&season=${encodeURIComponent(selectedSeason)}&phase=${selectedPhase?.id ?? ""}${journeeQS}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                tab === "calendrier" ? "bg-navy text-white" : "bg-white text-ink/60"
              }`}
            >
              Calendrier &amp; résultats
            </Link>
            <Link
              href={`/basket?ps=${selectedPsId}&tab=classement&scope=${scope}&season=${encodeURIComponent(selectedSeason)}&phase=${selectedPhase?.id ?? ""}${journeeQS}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                tab === "classement" ? "bg-navy text-white" : "bg-white text-ink/60"
              }`}
            >
              Classement
            </Link>
            <Link
              href={`/basket?ps=${selectedPsId}&tab=stats&scope=${scope}&season=${encodeURIComponent(selectedSeason)}&phase=${selectedPhase?.id ?? ""}${journeeQS}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                tab === "stats" ? "bg-navy text-white" : "bg-white text-ink/60"
              }`}
            >
              Statistiques &amp; Graphiques
            </Link>

            {tab === "calendrier" && (
              <div className="ml-auto flex overflow-hidden rounded-full bg-white shadow-sm">
                <Link
                  href={`/basket?ps=${selectedPsId}&tab=calendrier&scope=us&season=${encodeURIComponent(selectedSeason)}&phase=${selectedPhase?.id ?? ""}${journeeQS}`}
                  scroll={false}
                  className={`px-3 py-1.5 text-xs font-semibold ${
                    scope === "us" ? "bg-navy text-white" : "text-ink/50 hover:text-ink"
                  }`}
                >
                  {selectedPs?.club || "Sathonay Camp"}
                </Link>
                <Link
                  href={`/basket?ps=${selectedPsId}&tab=calendrier&scope=poule&season=${encodeURIComponent(selectedSeason)}&phase=${selectedPhase?.id ?? ""}${journeeQS}`}
                  scroll={false}
                  className={`px-3 py-1.5 text-xs font-semibold ${
                    scope === "poule" ? "bg-navy text-white" : "text-ink/50 hover:text-ink"
                  }`}
                >
                  Toute la poule
                </Link>
              </div>
            )}
          </div>

          <PhaseBar
            phases={phases}
            selectedPhase={selectedPhase}
            selectedPsId={selectedPsId}
            tab={tab}
            scope={scope}
            season={selectedSeason}
            isCurrentSeason={isCurrentSeason}
            journeeQS={journeeQS}
          />

          {isCurrentSeason && tab === "calendrier" && (
            <details className="rounded-card bg-white p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-navy">
                Ajouter un match manuellement
              </summary>
              {phases.length === 0 ? (
                <p className="mt-3 text-sm text-ink/50">
                  Ajoute d'abord une phase ci-dessus (ex. « Saison régulière ») pour pouvoir y rattacher un match.
                </p>
              ) : (
                <form action={addMatch} className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="participant_sport_id" value={selectedPsId} />
                  <select name="phase_id" defaultValue={selectedPhase?.id} className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm sm:col-span-2">
                    {phases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.phase_name}
                      </option>
                    ))}
                  </select>
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
              )}
            </details>
          )}

          {tab === "calendrier" && (
            <CalendrierTab
              matches={scopedMatches}
              journeeOptions={journeeOptions}
              selectedJournee={selectedJournee}
              participantSportId={selectedPsId}
              tab={tab}
              scope={scope}
              season={selectedSeason}
              phaseId={selectedPhase?.id}
              journeesMode={journeesMode}
              typeIcon={phaseTypeIcon}
              clubLogos={clubLogos}
            />
          )}
          {tab === "classement" && <ClassementTab classement={classement} matches={matches} />}
          {tab === "stats" && (
            <StatsTab
              playedMatches={playedMatches}
              phases={phases}
              selectedStatsPhaseIds={selectedStatsPhaseIds}
              selectedPsId={selectedPsId}
              scope={scope}
              selectedSeason={selectedSeason}
              selectedPhase={selectedPhase}
              statsPlayers={statsPlayers}
              statsRows={statsRows}
              selectedPlayerId={selectedPlayerId}
              statsQueryBase={statsQueryBase}
              statsMatchFocus={statsMatchFocus}
            />
          )}
        </>
      )}
    </div>
  );
}
