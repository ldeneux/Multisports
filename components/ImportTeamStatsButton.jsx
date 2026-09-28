"use client";

import { useState, useTransition } from "react";
import { ClipboardList, X, TriangleAlert } from "lucide-react";
import { importMatchStatsFromTeamStats } from "@/app/(protected)/basket/actions";

// Icône affichée sous le nom de la salle sur la feuille de match, pour
// rapatrier la saisie faite dans TeamStats (même base, même match via l'ID
// FFBB). Toujours affichée quand le match a un ID FFBB ; son état (grisée
// si rien à importer) dépend de `preview`, calculé côté serveur.
export default function ImportTeamStatsButton({ matchId, preview }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!preview) {
    return (
      <span
        title="Aucune saisie TeamStats trouvée pour ce match"
        className="inline-flex items-center gap-1 text-xs text-ink/25 cursor-not-allowed"
      >
        <ClipboardList size={14} /> TeamStats
      </span>
    );
  }

  function handleConfirm() {
    setError("");
    startTransition(async () => {
      try {
        const res = await importMatchStatsFromTeamStats(matchId);
        setResult(res);
      } catch (err) {
        setError(err?.message || "Échec de l'import.");
      }
    });
  }

  function closeAndReset() {
    setOpen(false);
    setResult(null);
    setError("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-lagoon hover:text-navy"
        title="Charger les statistiques saisies dans TeamStats"
      >
        <ClipboardList size={14} /> Charger depuis TeamStats
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-sm uppercase tracking-tight text-navy">
                Importer depuis TeamStats
              </h2>
              <button type="button" onClick={closeAndReset} className="text-ink/40 hover:text-cardinal">
                <X size={18} />
              </button>
            </div>

            {!result && !error && (
              <>
                <div className="mt-3 rounded-lg bg-sand/60 p-3 text-sm text-ink/70">
                  <p className="font-semibold text-ink">
                    {preview.teamHome} {preview.scoreHome ?? "–"} - {preview.scoreAway ?? "–"} {preview.teamAway}
                  </p>
                  <p className="mt-1">
                    {preview.playerCount} joueuse{preview.playerCount > 1 ? "s" : ""} saisie
                    {preview.playerCount > 1 ? "s" : ""}, {preview.periodCount ?? 4} quarts-temps.
                  </p>
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-cardinal/30 bg-cardinal/5 p-3 text-sm text-cardinal">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  <p>
                    Les statistiques actuellement saisies pour ce match dans MULTISPORTS (feuille de match,
                    quarts-temps) seront <strong>remplacées</strong> par celles de TeamStats. L'effectif de
                    l'équipe n'est jamais remplacé : les joueuses reconnues y sont seulement ajoutées si elles
                    n'y figurent pas encore.
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink/60 hover:bg-sand"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isPending}
                    className="rounded-lg bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
                  >
                    {isPending ? "Import en cours…" : "Remplacer et importer"}
                  </button>
                </div>
              </>
            )}

            {error && (
              <>
                <p className="mt-3 rounded-lg bg-cardinal/10 p-3 text-sm text-cardinal">{error}</p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="rounded-lg bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy/90"
                  >
                    Fermer
                  </button>
                </div>
              </>
            )}

            {result && !error && (
              <>
                <p className="mt-3 text-sm text-ink/70">
                  {result.imported} joueuse{result.imported > 1 ? "s" : ""} importée{result.imported > 1 ? "s" : ""}.
                  {result.created.length > 0 && (
                    <> {result.created.length} nouvelle{result.created.length > 1 ? "s" : ""} fiche
                    {result.created.length > 1 ? "s" : ""} créée{result.created.length > 1 ? "s" : ""} :{" "}
                    {result.created.join(", ")}.</>
                  )}
                </p>
                {result.ambiguous.length > 0 && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-cardinal/30 bg-cardinal/5 p-3 text-sm text-cardinal">
                    <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                    <p>
                      Non reconnues (plusieurs fiches possibles, à rattacher à la main) :{" "}
                      {result.ambiguous.join(", ")}.
                    </p>
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="rounded-lg bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy/90"
                  >
                    Fermer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
