import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, ffbbAssetUrl, computeCurrentSeasonLabel } from "@/lib/utils";
import SyncButton from "@/components/SyncButton";
import SeasonSelect from "@/components/SeasonSelect";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import {
  addMatch,
  recordScore,
  saveMatchReport,
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

// Barre "compétition jouée" : nom de la compétition + poule (avec lien vers
// competitions.ffbb.com si renseigné), bascule entre phases quand il y en a
// plusieurs dans la saison (ex. Saison régulière / Phase 2 / Phase 3), et
// panneau de gestion (ajout/édition/suppression/synchro par phase). Chaque
// phase a son propre ID FFBB (engagement) — c'est ce qui permet de suivre
// plusieurs compétitions successives dans la même saison.
function PhaseBar({ phases, selectedPhase, selectedPsId, tab, scope, season, isCurrentSeason }) {
  const linkBase = `/basket?ps=${selectedPsId}&tab=${tab}&scope=${scope}&season=${encodeURIComponent(season)}`;
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

function MatchCard({ m, clubName, typeIcon }) {
  const isPlayed = m.status === "joue";
  const usIsLeft = m.us_is_team1 === true;
  const usIsRight = m.us_is_team1 === false;
  const concernsUs = m.us_is_team1 !== null;
  const report = m.match_report;

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
    <div className="flex flex-col gap-2 rounded-card bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
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
            className={`min-w-0 flex-1 truncate text-sm ${
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

      {/* Feuille de match libre (quarts-temps + notes) — disponible pour tout
          match joué saisi à la main, typiquement un match amical. */}
      {isPlayed && m.source === "manuel" && (
        <details className="border-t border-ink/5 pt-2">
          <summary className="cursor-pointer text-xs font-semibold text-ink/40 hover:text-navy">
            Feuille de match{report ? " (enregistrée)" : ""}
          </summary>
          <form action={saveMatchReport} className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5 sm:items-end">
            <input type="hidden" name="match_id" value={m.id} />
            {[1, 2, 3, 4].map((q) => (
              <div key={q} className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-ink/40">Quart-temps {q}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    name={`q${q}_us`}
                    defaultValue={report?.quarters?.[q - 1]?.us ?? ""}
                    placeholder={clubName || "Nous"}
                    className="w-14 rounded-lg border border-ink/15 px-1 py-0.5"
                  />
                  <span className="text-ink/30">-</span>
                  <input
                    type="number"
                    min="0"
                    name={`q${q}_them`}
                    defaultValue={report?.quarters?.[q - 1]?.them ?? ""}
                    placeholder="Eux"
                    className="w-14 rounded-lg border border-ink/15 px-1 py-0.5"
                  />
                </div>
              </div>
            ))}
            <button
              type="submit"
              className="col-span-2 rounded-full bg-navy px-3 py-1.5 font-semibold text-white hover:bg-navy-light sm:col-span-1"
            >
              Enregistrer
            </button>
            <textarea
              name="notes"
              defaultValue={report?.notes ?? ""}
              placeholder="Notes (arbitre, ambiance, faits marquants...)"
              rows={2}
              className="col-span-2 rounded-lg border border-ink/15 px-2 py-1.5 sm:col-span-5"
            />
          </form>
        </details>
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
  journeesMode,
  clubName,
  typeIcon,
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

  const baseParams = `ps=${participantSportId}&tab=${tab}&scope=${scope}&season=${encodeURIComponent(season)}`;
  const journeeHref = (j) => `/basket?${baseParams}&journees=une&journee=${encodeURIComponent(j)}`;
  const toutesHref = `/basket?${baseParams}&journees=toutes`;
  const uneHref = `/basket?${baseParams}&journees=une&journee=${encodeURIComponent(selectedJournee ?? "")}`;

  const currentIndex = journeeOptions.indexOf(selectedJournee);
  const prevJournee = currentIndex > 0 ? journeeOptions[currentIndex - 1] : null;
  const nextJournee =
    currentIndex >= 0 && currentIndex < journeeOptions.length - 1 ? journeeOptions[currentIndex + 1] : null;

  const undated = matches.filter((m) => !m.numero_journee);
  const showAll = journeesMode === "toutes";

  // journée par journée, dans l'ordre — utilisé seulement en mode "toutes".
  const byJournee = journeeOptions.map((j) => ({
    journee: j,
    rows: matches.filter((m) => m.numero_journee === j),
  }));

  const journeeMatches = !showAll && selectedJournee ? matches.filter((m) => m.numero_journee === selectedJournee) : [];

  return (
    <div className="space-y-4">
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
                  <MatchCard key={m.id} m={m} clubName={clubName} typeIcon={typeIcon} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {journeeMatches.map((m) => (
            <MatchCard key={m.id} m={m} clubName={clubName} typeIcon={typeIcon} />
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
              <MatchCard key={m.id} m={m} clubName={clubName} typeIcon={typeIcon} />
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
                  href={`/basket?ps=${selectedPsId}&tab=calendrier&scope=us&season=${encodeURIComponent(selectedSeason)}`}
                  scroll={false}
                  className={`px-3 py-1.5 text-xs font-semibold ${
                    scope === "us" ? "bg-navy text-white" : "text-ink/50 hover:text-ink"
                  }`}
                >
                  {selectedPs?.club || "Sathonay Camp"}
                </Link>
                <Link
                  href={`/basket?ps=${selectedPsId}&tab=calendrier&scope=poule&season=${encodeURIComponent(selectedSeason)}`}
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
              journeesMode={journeesMode}
              clubName={selectedPs?.club}
              typeIcon={phaseTypeIcon}
            />
          )}
          {tab === "classement" && <ClassementTab classement={classement} />}
          {tab === "stats" && <StatsTab playedMatches={playedMatches} />}
        </>
      )}
    </div>
  );
}
