"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prepareTeamsSync, syncTeamsBatch, finishTeamsSync } from "@/app/(protected)/basket/actions";

const BATCH = 4;

// « Mettre à jour les calendriers & résultats » : lit le cache FFBB poule par poule (par petits
// lots, pour rester sous la limite de durée du serveur) et enregistre, pour la participante
// choisie, les phases / matchs / classements de la saison en cours. Le serveur ignore tout
// ce qui n'est pas de la saison en cours : une saison passée n'est jamais touchée.
export default function SyncTeamsButton({ participantSportId, lastSyncAt, lastSyncSummary, lastSyncError }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState(null);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    setResults(null);
    setInfo(null);
    try {
      const prep = await prepareTeamsSync(participantSportId);
      if (prep.error) throw new Error(prep.error);
      setInfo(prep);
      setProgress({ done: 0, total: prep.pouleIds.length });

      const all = [];
      for (let i = 0; i < prep.pouleIds.length; i += BATCH) {
        const r = await syncTeamsBatch(participantSportId, prep.pouleIds.slice(i, i + BATCH));
        if (r.error) throw new Error(r.error);
        all.push(...r.results);
        setResults([...all]);
        setProgress({ done: Math.min(i + BATCH, prep.pouleIds.length), total: prep.pouleIds.length });
      }

      const ok = all.filter((x) => x.status === "ok");
      const errors = all.filter((x) => x.status === "erreur").length;
      const matches = ok.reduce((n, x) => n + x.matches, 0);
      await finishTeamsSync(participantSportId, {
        errors,
        text: `${ok.length} poule(s) mise(s) à jour, ${matches} match(s) — équipes : ${prep.teams.join(", ")}.`,
      });
      router.refresh();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  const counts = results
    ? {
        ok: results.filter((r) => r.status === "ok").length,
        skip: results.filter((r) => r.status === "ignoree").length,
        err: results.filter((r) => r.status === "erreur").length,
      }
    : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-full bg-lagoon px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {running ? `Mise à jour ${progress.done}/${progress.total}…` : "⬇ Mettre à jour les calendriers & résultats"}
        </button>
        {lastSyncAt && !running && !results && (
          <p className={`text-xs ${lastSyncError ? "text-cardinal-dark" : "text-ink/40"}`}>
            Dernière mise à jour : {lastSyncAt}
            {lastSyncError ? ` — ${lastSyncError}` : lastSyncSummary ? ` — ${lastSyncSummary}` : " — OK"}
          </p>
        )}
      </div>

      {info && (
        <p className="text-xs text-ink/50">
          Équipes suivies : {info.teams.join(", ")} (saison {info.season}, lues dans {info.teamsSource}).
        </p>
      )}
      {running && (
        <div className="h-2 overflow-hidden rounded-full bg-sand">
          <div
            className="h-full bg-lagoon transition-all"
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
      )}
      {error && <p className="rounded-lg bg-cardinal-light p-2 text-xs text-cardinal-dark break-words">{error}</p>}
      {results && counts && (
        <details className="rounded-lg bg-sand p-2 text-xs text-ink/70" open={counts.err > 0}>
          <summary className="cursor-pointer font-semibold">
            {counts.ok} poule(s) mise(s) à jour · {counts.skip} ignorée(s) · {counts.err} en erreur
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
            {results
              .filter((r) => r.status !== "ignoree" || counts.ok === 0)
              .map((r) => (
                <li key={r.pouleId} className={r.status === "erreur" ? "text-cardinal-dark" : ""}>
                  {r.status === "ok" ? "✓" : r.status === "ignoree" ? "–" : "✕"} poule {r.pouleId} : {r.message}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
