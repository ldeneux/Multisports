"use client";

import { useMemo, useState } from "react";

function formatMinutes(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function pointsFrom(row) {
  if (!row) return 0;
  return (row.twoMade ?? 0) * 2 + (row.threeMade ?? 0) * 3 + (row.ftMade ?? 0);
}

const inputCls = "w-10 rounded-lg border border-ink/15 px-1 py-1 text-center";

// Une seule table pour la feuille de match : boutons TOUT / Q1 / Q2... au-dessus.
//  - Pas de période importée pour ce match -> TOUT est le formulaire de
//    saisie manuelle habituel (comportement historique, inchangé).
//  - Dès qu'il y a des périodes -> TOUT devient un total calculé en LECTURE
//    SEULE (somme des périodes, jamais la valeur brute stockée) et on édite
//    à la place directement sur chaque onglet Q1..Qn ; l'enregistrement y
//    écrit dans basketball_match_period_stats puis recalcule le total.
// Colonnes toujours en lecture seule : Joueuse (jamais éditable) et Pts
// (toujours calculé). "5 majeur" ne concerne que les onglets de période dès
// qu'il y en a (un cinq de départ, c'est par quart-temps).
export default function MatchStatsTable({ players, totals, periodStats, periodCount = 4, periodPrefix = "Q" }) {
  const sortedPeriods = useMemo(() => Array.from({ length: periodCount }, (_, i) => i + 1), [periodCount]);
  const hasPeriods = periodStats.length > 0;
  const [tab, setTab] = useState("TOUT");

  const totalsByPlayer = useMemo(() => new Map(totals.map((r) => [r.playerId, r])), [totals]);
  const periodByPlayer = useMemo(() => {
    const map = new Map();
    for (const r of periodStats) {
      if (!map.has(r.period)) map.set(r.period, new Map());
      map.get(r.period).set(r.playerId, r);
    }
    return map;
  }, [periodStats]);

  function sumPeriods(playerId) {
    const rows = sortedPeriods.map((p) => periodByPlayer.get(p)?.get(playerId)).filter(Boolean);
    const sum = (key) => rows.reduce((s, r) => s + (r[key] ?? 0), 0);
    return {
      playingTimeSeconds: sum("playingTimeSeconds"),
      ftMade: sum("ftMade"),
      ftAtt: sum("ftAtt"),
      twoMade: sum("pts2Made"),
      twoAtt: sum("pts2Att"),
      threeMade: sum("pts3Made"),
      threeAtt: sum("pts3Att"),
      rebOff: sum("rebOff"),
      rebDef: sum("rebDef"),
      assists: sum("assists"),
      fouls: sum("fouls"),
      foulsDrawn: sum("foulsDrawn"),
    };
  }

  // TOUT n'est éditable QUE s'il n'existe aucune période importée pour ce
  // match. Dès qu'il y en a, on édite uniquement sur les onglets Q1..Qn.
  const editable = tab === "TOUT" ? !hasPeriods : true;
  const showStartingColumn = tab !== "TOUT" || !hasPeriods;

  return (
    <div>
      <input type="hidden" name="period" value={tab === "TOUT" ? "" : tab} />
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTab("TOUT")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            tab === "TOUT" ? "bg-navy text-white" : "bg-sand text-ink/60 hover:bg-sand/70"
          }`}
        >
          TOUT
        </button>
        {sortedPeriods.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setTab(p)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              tab === p ? "bg-navy text-white" : "bg-sand text-ink/60 hover:bg-sand/70"
            }`}
          >
            {periodPrefix}{p}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-xs">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[10px] uppercase tracking-wide text-ink/40">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Joueuse</th>
              {showStartingColumn && <th className="px-1.5 text-center">5 maj.</th>}
              <th className="px-1.5 text-center">Tps</th>
              <th className="px-1.5 text-center">LF</th>
              <th className="px-1.5 text-center">2 pts</th>
              <th className="px-1.5 text-center">3 pts</th>
              <th className="px-1.5 text-center">Reb. O</th>
              <th className="px-1.5 text-center">Reb. D</th>
              <th className="px-1.5 text-center">Passes</th>
              <th className="px-1.5 text-center">FT</th>
              <th className="px-1.5 text-center">FS</th>
              <th className="px-1.5 text-center">Pts</th>
              <th className="px-1.5 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const totalRow = totalsByPlayer.get(p.id);
              const periodRow = tab !== "TOUT" ? periodByPlayer.get(tab)?.get(p.id) : null;
              // Valeurs affichées : celles de la période active si on est sur
              // un onglet Qn, sinon la somme des périodes (TOUT+périodes) ou
              // le total brut (TOUT sans période).
              const display =
                tab === "TOUT"
                  ? hasPeriods
                    ? sumPeriods(p.id)
                    : {
                        playingTimeSeconds: null,
                        ftMade: totalRow?.ftMade ?? 0,
                        ftAtt: totalRow?.ftAtt ?? 0,
                        twoMade: totalRow?.twoMade ?? 0,
                        twoAtt: totalRow?.twoAtt ?? 0,
                        threeMade: totalRow?.threeMade ?? 0,
                        threeAtt: totalRow?.threeAtt ?? 0,
                        rebOff: totalRow?.rebOff ?? 0,
                        rebDef: totalRow?.rebDef ?? 0,
                        assists: totalRow?.assists ?? 0,
                        fouls: totalRow?.fouls ?? 0,
                        foulsDrawn: totalRow?.foulsDrawn ?? 0,
                      }
                  : {
                      playingTimeSeconds: periodRow?.playingTimeSeconds ?? 0,
                      ftMade: periodRow?.ftMade ?? 0,
                      ftAtt: periodRow?.ftAtt ?? 0,
                      twoMade: periodRow?.pts2Made ?? 0,
                      twoAtt: periodRow?.pts2Att ?? 0,
                      threeMade: periodRow?.pts3Made ?? 0,
                      threeAtt: periodRow?.pts3Att ?? 0,
                      rebOff: periodRow?.rebOff ?? 0,
                      rebDef: periodRow?.rebDef ?? 0,
                      assists: periodRow?.assists ?? 0,
                      fouls: periodRow?.fouls ?? 0,
                      foulsDrawn: periodRow?.foulsDrawn ?? 0,
                    };
              const points = pointsFrom(display);
              const startingChecked = tab === "TOUT" ? totalRow?.isStartingFive ?? false : periodRow?.isStarter ?? false;

              return (
                <tr key={`${p.id}-${tab}`} className="border-b border-ink/5 last:border-0">
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min="0"
                      name={`jersey_match_${p.id}`}
                      defaultValue={totalRow?.jerseyNumberMatch ?? p.jerseyNumber ?? ""}
                      placeholder={p.jerseyNumber ?? "—"}
                      title="Numéro porté ce jour-là, s'il diffère du numéro habituel"
                      className="w-12 rounded-lg border border-ink/15 px-1 py-1 text-center"
                    />
                  </td>
                  <td className="py-1 pr-2 font-semibold text-ink">
                    {p.firstName}
                    <input type="hidden" name="player_id" value={p.id} />
                  </td>

                  {showStartingColumn && (
                    <td className="px-1.5 text-center">
                      <input
                        type="checkbox"
                        name={`starting_${p.id}`}
                        defaultChecked={startingChecked}
                        disabled={!editable}
                        className="h-4 w-4"
                      />
                    </td>
                  )}

                  {editable ? (
                    <>
                      <td className="px-1.5">
                        <input
                          type="text"
                          name={`minutes_${p.id}`}
                          defaultValue={tab === "TOUT" ? totalRow?.minutesPlayed ?? "" : formatMinutes(display.playingTimeSeconds)}
                          placeholder="MM:SS"
                          pattern="^[0-9]{1,3}:[0-5][0-9]$"
                          title="Format MM:SS, ex. 12:30"
                          className="w-16 rounded-lg border border-ink/15 px-1 py-1 text-center"
                        />
                      </td>
                      <td className="px-1.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <input type="number" min="0" name={`ft_made_${p.id}`} defaultValue={display.ftMade} className={inputCls} />
                          <span className="text-ink/30">/</span>
                          <input type="number" min="0" name={`ft_att_${p.id}`} defaultValue={display.ftAtt} className={inputCls} />
                        </div>
                      </td>
                      <td className="px-1.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <input type="number" min="0" name={`two_made_${p.id}`} defaultValue={display.twoMade} className={inputCls} />
                          <span className="text-ink/30">/</span>
                          <input type="number" min="0" name={`two_att_${p.id}`} defaultValue={display.twoAtt} className={inputCls} />
                        </div>
                      </td>
                      <td className="px-1.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <input type="number" min="0" name={`three_made_${p.id}`} defaultValue={display.threeMade} className={inputCls} />
                          <span className="text-ink/30">/</span>
                          <input type="number" min="0" name={`three_att_${p.id}`} defaultValue={display.threeAtt} className={inputCls} />
                        </div>
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`reb_off_${p.id}`} defaultValue={display.rebOff} className={inputCls} />
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`reb_def_${p.id}`} defaultValue={display.rebDef} className={inputCls} />
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`assists_${p.id}`} defaultValue={display.assists} className={inputCls} />
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`fouls_${p.id}`} defaultValue={display.fouls} className={`${inputCls} text-cardinal`} />
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`fouls_drawn_${p.id}`} defaultValue={display.foulsDrawn} className={`${inputCls} text-lagoon`} />
                      </td>
                      <td className="px-1.5 text-center font-display font-bold text-navy">{points}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-1.5 text-center text-ink/70">{formatMinutes(display.playingTimeSeconds)}</td>
                      <td className="px-1.5 text-center text-ink/70">{display.ftMade}/{display.ftAtt}</td>
                      <td className="px-1.5 text-center text-ink/70">{display.twoMade}/{display.twoAtt}</td>
                      <td className="px-1.5 text-center text-ink/70">{display.threeMade}/{display.threeAtt}</td>
                      <td className="px-1.5 text-center text-ink/70">{display.rebOff}</td>
                      <td className="px-1.5 text-center text-ink/70">{display.rebDef}</td>
                      <td className="px-1.5 text-center text-ink/70">{display.assists}</td>
                      <td className="px-1.5 text-center font-semibold text-cardinal">{display.fouls}</td>
                      <td className="px-1.5 text-center font-semibold text-lagoon">{display.foulsDrawn}</td>
                      <td className="px-1.5 text-center font-display font-bold text-navy">{points}</td>
                      {/* TOUT calculé (import) : on republie la somme des périodes dans
                          le formulaire via des champs cachés, pour que
                          "Enregistrer les statistiques" garde basketball_match_stats
                          (lu par les graphiques) synchronisé. */}
                      <input type="hidden" name={`minutes_${p.id}`} value={formatMinutes(display.playingTimeSeconds)} />
                      <input type="hidden" name={`ft_made_${p.id}`} value={display.ftMade} />
                      <input type="hidden" name={`ft_att_${p.id}`} value={display.ftAtt} />
                      <input type="hidden" name={`two_made_${p.id}`} value={display.twoMade} />
                      <input type="hidden" name={`two_att_${p.id}`} value={display.twoAtt} />
                      <input type="hidden" name={`three_made_${p.id}`} value={display.threeMade} />
                      <input type="hidden" name={`three_att_${p.id}`} value={display.threeAtt} />
                      <input type="hidden" name={`reb_off_${p.id}`} value={display.rebOff} />
                      <input type="hidden" name={`reb_def_${p.id}`} value={display.rebDef} />
                      <input type="hidden" name={`assists_${p.id}`} value={display.assists} />
                      <input type="hidden" name={`fouls_${p.id}`} value={display.fouls} />
                      <input type="hidden" name={`fouls_drawn_${p.id}`} value={display.foulsDrawn} />
                      {!showStartingColumn && (
                        <input type="hidden" name={`starting_${p.id}`} value={startingChecked ? "on" : ""} />
                      )}
                    </>
                  )}

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
      </div>
      {tab !== "TOUT" && (
        <p className="mt-1.5 text-[11px] text-ink/40">
          {periodPrefix === "P" ? "Période" : "Quart-temps"} {tab} — modifie et enregistre normalement, le total se recalcule tout seul.
        </p>
      )}
    </div>
  );
}
