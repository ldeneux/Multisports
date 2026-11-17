"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prepareTeamsSync, syncTeamsBatch } from "@/app/(protected)/basket/actions";

const BATCH = 4;

// « Mettre à jour les calendriers & résultats » : lit le cache FFBB poule par poule (par petits
// lots, pour rester sous la limite de durée du serveur) et enregistre, pour TOUTES les
// participantes, les phases / matchs / classements de la saison en cours. Le serveur ignore
// tout ce qui n'est pas de la saison en cours : une saison passée n'est jamais touchée.
export default function SyncTeamsButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState(null);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setOpen(true);
    setError("");
    setResults(null);
    setInfo(null);
    try {
      const prep = await prepareTeamsSync();
      if (prep.error) throw new Error(prep.error);
      setInfo(prep);
      setProgress({ done: 0, total: prep.pouleIds.length });

      const all = [];
      for (let i = 0; i < prep.pouleIds.length; i += BATCH) {
        const r = await syncTeamsBatch(prep.pouleIds.slice(i, i + BATCH));
        if (r.error) throw new Error(r.error);
        all.push(...r.results);
        setResults([...all]);
        setProgress({ done: Math.min(i + BATCH, prep.pouleIds.length), total: prep.pouleIds.length });
      }
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
    <div className="relative">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-full bg-lagoon px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {running ? `Mise à jour ${progress.done}/${progress.total}…` : "⬇ Mettre à jour les calendriers & résultats"}
      </button>

      {open && (info || error || results) && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[22rem] max-w-[90vw] space-y-2 rounded-card bg-white p-3 text-xs text-ink/70 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-navy">Mise à jour de la saison {info?.season ?? ""}</p>
            {!running && (
              <button type="button" onClick={() => setOpen(false)} className="text-ink/40 hover:text-ink" aria-label="Fermer">
                ✕
              </button>
            )}
          </div>

          {info && (
            <ul className="space-y-0.5">
              {info.participants.map((p) => (
                <li key={p.name} className={p.error ? "text-cardinal-dark" : ""}>
                  <span className="font-semibold">{p.name}</span> :{" "}
                  {p.error ? p.error : p.teams.join(", ")}
                </li>
              ))}
            </ul>
          )}

          {running && (
            <div className="h-2 overflow-hidden rounded-full bg-sand">
              <div
                className="h-full bg-lagoon transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          )}
          {error && <p className="rounded-lg bg-cardinal-light p-2 text-cardinal-dark break-words">{error}</p>}

          {results && counts && (
            <details className="rounded-lg bg-sand p-2" open={counts.err > 0 || (!running && counts.ok > 0)}>
              <summary className="cursor-pointer font-semibold">
                {counts.ok} poule(s) mise(s) à jour · {counts.skip} ignorée(s) · {counts.err} en erreur
              </summary>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
                {results
                  .filter((r) => r.status !== "ignoree")
                  .map((r) => (
                    <li key={r.pouleId} className={r.status === "erreur" ? "text-cardinal-dark" : ""}>
                      {r.status === "ok" ? "✓" : "✕"} {r.message}
                    </li>
                  ))}
                {counts.ok + counts.err === 0 && <li>Aucune poule concernée dans le cache.</li>}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
