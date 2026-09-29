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

// Une seule table pour la feuille de match : colonnes fixes à gauche (N° du
// jour, Cap., 5 majeur — toujours éditables, identiques quel que soit
// l'onglet) + colonnes de stats à droite, dont le contenu bascule avec les
// boutons TOUT / Q1 / Q2... Sans import TeamStats (pas de périodes), TOUT
// reste le formulaire de saisie manuelle habituel. Dès qu'il y a des
// périodes, TOUT devient un total calculé en lecture seule (somme des
// périodes — jamais la valeur stockée, potentiellement fausse) et
// ré-injecté dans le formulaire via des champs cachés pour que
// l'enregistrement garde `basketball_match_stats` à jour (c'est cette table
// que lisent les graphiques de la page Profil).
export default function MatchStatsTable({ players, totals, periodStats }) {
  const sortedPeriods = useMemo(() => [...new Set(periodStats.map((r) => r.period))].sort((a, b) => a - b), [periodStats]);
  const hasPeriods = sortedPeriods.length > 0;
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

  // Somme des périodes pour une joueuse — c'est CETTE valeur qui fait foi
  // pour l'onglet TOUT dès qu'il y a un import, jamais le total brut stocké.
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

  const activeRowFor = (playerId) => {
    if (tab === "TOUT") return hasPeriods ? sumPeriods(playerId) : null; // null => on lit les defaultValue des inputs
    const r = periodByPlayer.get(tab)?.get(playerId);
    return {
      playingTimeSeconds: r?.playingTimeSeconds ?? 0,
      ftMade: r?.ftMade ?? 0,
      ftAtt: r?.ftAtt ?? 0,
      twoMade: r?.pts2Made ?? 0,
      twoAtt: r?.pts2Att ?? 0,
      threeMade: r?.pts3Made ?? 0,
      threeAtt: r?.pts3Att ?? 0,
      rebOff: r?.rebOff ?? 0,
      rebDef: r?.rebDef ?? 0,
      assists: r?.assists ?? 0,
      fouls: r?.fouls ?? 0,
      foulsDrawn: r?.foulsDrawn ?? 0,
    };
  };

  return (
    <div>
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
            Q{p}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[10px] uppercase tracking-wide text-ink/40">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Joueuse</th>
              <th className="px-1.5 text-center">Cap.</th>
              <th className="px-1.5 text-center">5 maj.</th>
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
              const active = activeRowFor(p.id); // null si TOUT éditable (pas de période)
              const editable = tab === "TOUT" && !hasPeriods;
              const points = editable ? null : pointsFrom(active);
              return (
                <tr key={p.id} className="border-b border-ink/5 last:border-0">
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
                  <td className="px-1.5 text-center">
                    <input
                      type="checkbox"
                      name={`captain_${p.id}`}
                      defaultChecked={totalRow?.isCaptain ?? false}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-1.5 text-center">
                    <input
                      type="checkbox"
                      name={`starting_${p.id}`}
                      defaultChecked={totalRow?.isStartingFive ?? false}
                      className="h-4 w-4"
                    />
                  </td>

                  {editable ? (
                    <>
                      <td className="px-1.5">
                        <input
                          type="text"
                          name={`minutes_${p.id}`}
                          defaultValue={totalRow?.minutesPlayed ?? ""}
                          placeholder="MM:SS"
                          pattern="^[0-9]{1,3}:[0-5][0-9]$"
                          title="Format MM:SS, ex. 12:30"
                          className="w-16 rounded-lg border border-ink/15 px-1 py-1 text-center"
                        />
                      </td>
                      <td className="px-1.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <input type="number" min="0" name={`ft_made_${p.id}`} defaultValue={totalRow?.ftMade ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center" />
                          <span className="text-ink/30">/</span>
                          <input type="number" min="0" name={`ft_att_${p.id}`} defaultValue={totalRow?.ftAtt ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center" />
                        </div>
                      </td>
                      <td className="px-1.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <input type="number" min="0" name={`two_made_${p.id}`} defaultValue={totalRow?.twoMade ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center" />
                          <span className="text-ink/30">/</span>
                          <input type="number" min="0" name={`two_att_${p.id}`} defaultValue={totalRow?.twoAtt ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center" />
                        </div>
                      </td>
                      <td className="px-1.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <input type="number" min="0" name={`three_made_${p.id}`} defaultValue={totalRow?.threeMade ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center" />
                          <span className="text-ink/30">/</span>
                          <input type="number" min="0" name={`three_att_${p.id}`} defaultValue={totalRow?.threeAtt ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center" />
                        </div>
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`reb_off_${p.id}`} defaultValue={totalRow?.rebOff ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center" />
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`reb_def_${p.id}`} defaultValue={totalRow?.rebDef ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center" />
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`assists_${p.id}`} defaultValue={totalRow?.assists ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center" />
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`fouls_${p.id}`} defaultValue={totalRow?.fouls ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center text-cardinal" />
                      </td>
                      <td className="px-1.5">
                        <input type="number" min="0" name={`fouls_drawn_${p.id}`} defaultValue={totalRow?.foulsDrawn ?? 0} className="w-10 rounded-lg border border-ink/15 px-1 py-1 text-center text-lagoon" />
                      </td>
                      <td className="px-1.5 text-center font-display font-bold text-navy">
                        {pointsFrom({ twoMade: totalRow?.twoMade ?? 0, threeMade: totalRow?.threeMade ?? 0, ftMade: totalRow?.ftMade ?? 0 })}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-1.5 text-center text-ink/70">{formatMinutes(active.playingTimeSeconds)}</td>
                      <td className="px-1.5 text-center text-ink/70">{active.ftMade}/{active.ftAtt}</td>
                      <td className="px-1.5 text-center text-ink/70">{active.twoMade}/{active.twoAtt}</td>
                      <td className="px-1.5 text-center text-ink/70">{active.threeMade}/{active.threeAtt}</td>
                      <td className="px-1.5 text-center text-ink/70">{active.rebOff}</td>
                      <td className="px-1.5 text-center text-ink/70">{active.rebDef}</td>
                      <td className="px-1.5 text-center text-ink/70">{active.assists}</td>
                      <td className="px-1.5 text-center font-semibold text-cardinal">{active.fouls}</td>
                      <td className="px-1.5 text-center font-semibold text-lagoon">{active.foulsDrawn}</td>
                      <td className="px-1.5 text-center font-display font-bold text-navy">{points}</td>
                      {/* Onglet TOUT calculé (import) : on republie la somme des périodes
                          dans le formulaire via des champs cachés, pour que
                          "Enregistrer les statistiques" garde basketball_match_stats
                          (lu par les graphiques) synchronisé avec les périodes. */}
                      {tab === "TOUT" && (
                        <>
                          <input type="hidden" name={`minutes_${p.id}`} value={formatMinutes(active.playingTimeSeconds)} />
                          <input type="hidden" name={`ft_made_${p.id}`} value={active.ftMade} />
                          <input type="hidden" name={`ft_att_${p.id}`} value={active.ftAtt} />
                          <input type="hidden" name={`two_made_${p.id}`} value={active.twoMade} />
                          <input type="hidden" name={`two_att_${p.id}`} value={active.twoAtt} />
                          <input type="hidden" name={`three_made_${p.id}`} value={active.threeMade} />
                          <input type="hidden" name={`three_att_${p.id}`} value={active.threeAtt} />
                          <input type="hidden" name={`reb_off_${p.id}`} value={active.rebOff} />
                          <input type="hidden" name={`reb_def_${p.id}`} value={active.rebDef} />
                          <input type="hidden" name={`assists_${p.id}`} value={active.assists} />
                          <input type="hidden" name={`fouls_${p.id}`} value={active.fouls} />
                          <input type="hidden" name={`fouls_drawn_${p.id}`} value={active.foulsDrawn} />
                        </>
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
      {hasPeriods && tab !== "TOUT" && (
        <p className="mt-1.5 text-[11px] text-ink/40">
          Détail importé de TeamStats pour ce quart-temps — lecture seule.
        </p>
      )}
    </div>
  );
}
