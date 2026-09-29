"use client";

import { useMemo, useState } from "react";

function formatMinutes(seconds, fallbackText) {
  if (seconds == null) return fallbackText || "00:00";
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Une seule table de stats, en lecture seule, avec un bouton par période du
// match ("TOUT" + "Q1", "Q2"...) qui bascule les valeurs affichées — même
// principe que l'écran "Statistiques Joueuses" de TeamStats, sans les
// cellules éditables (ici c'est un import, pas une saisie).
export default function PeriodStatsTable({ players, totals, periodStats }) {
  const periods = useMemo(
    () => Array.from(new Set(periodStats.map((r) => r.period))).sort((a, b) => a - b),
    [periodStats]
  );
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

  const rowsForTab = tab === "TOUT" ? totalsByPlayer : periodByPlayer.get(tab) ?? new Map();

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
        {periods.map((p) => (
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
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[10px] uppercase tracking-wide text-ink/40">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Joueuse</th>
              <th className="px-1.5 text-center">Pts</th>
              <th className="px-1.5 text-center">2 pts</th>
              <th className="px-1.5 text-center">3 pts</th>
              <th className="px-1.5 text-center">LF</th>
              <th className="px-1.5 text-center">Reb. O</th>
              <th className="px-1.5 text-center">Reb. D</th>
              <th className="px-1.5 text-center">Passes</th>
              <th className="px-1.5 text-center">FT</th>
              <th className="px-1.5 text-center">FS</th>
              <th className="px-1.5 text-center">Tps</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const r = rowsForTab.get(p.id);
              return (
                <tr key={p.id} className="border-b border-ink/5 last:border-0">
                  <td className="py-1 pr-2 text-ink/50">{p.jerseyNumberMatch ?? "—"}</td>
                  <td className="py-1 pr-2 font-semibold text-ink">{p.firstName}</td>
                  <td className="px-1.5 text-center font-semibold text-navy">{r?.points ?? 0}</td>
                  <td className="px-1.5 text-center">
                    {r?.pts2Made ?? 0}/{r?.pts2Att ?? 0}
                  </td>
                  <td className="px-1.5 text-center">
                    {r?.pts3Made ?? 0}/{r?.pts3Att ?? 0}
                  </td>
                  <td className="px-1.5 text-center">
                    {r?.ftMade ?? 0}/{r?.ftAtt ?? 0}
                  </td>
                  <td className="px-1.5 text-center">{r?.rebOff ?? 0}</td>
                  <td className="px-1.5 text-center">{r?.rebDef ?? 0}</td>
                  <td className="px-1.5 text-center">{r?.assists ?? 0}</td>
                  <td className="px-1.5 text-center text-cardinal">{r?.fouls ?? 0}</td>
                  <td className="px-1.5 text-center text-lagoon">{r?.foulsDrawn ?? 0}</td>
                  <td className="px-1.5 text-center">
                    {formatMinutes(r?.playingTimeSeconds, r?.minutesPlayed)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
