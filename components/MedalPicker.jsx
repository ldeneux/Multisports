"use client";

import { useState, useTransition } from "react";
import MedalIcon, { MEDAL_KINDS, medalLabel } from "@/components/MedalIcon";
import { setRaceMedal } from "@/app/(protected)/natation/actions";

// Enveloppe la ligne de la nageuse suivie dans un classement : un clic ouvre un petit menu pour lui attribuer
// une médaille (or, argent, bronze) pour cette course, ou la retirer. kind = "result" (course individuelle) ou
// "relay" (relais, médaille de l'équipe) ; id = identifiant de la ligne en base.
export default function MedalPicker({ kind, id, medal, children }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function choose(value) {
    setError("");
    startTransition(async () => {
      const res = await setRaceMedal(kind, id, value);
      if (res?.ok) setOpen(false);
      else setError(res?.error || "Enregistrement impossible.");
    });
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title="Cliquer pour attribuer une médaille à cette course"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="cursor-pointer"
      >
        {children}
      </div>

      {open && (
        <div className="my-1 flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-ink/10">
          <span className="font-semibold text-ink/60">Médaille pour cette course :</span>
          {MEDAL_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={pending}
              onClick={() => choose(k)}
              title={`Médaille d'${medalLabel(k)}`}
              aria-label={`Médaille d'${medalLabel(k)}`}
              aria-pressed={medal === k}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold capitalize ${
                medal === k ? "bg-navy text-white" : "bg-sand text-ink/70 hover:bg-lagoon-light"
              } disabled:opacity-50`}
            >
              <MedalIcon kind={k} size={18} />
              {medalLabel(k)}
            </button>
          ))}
          {medal && (
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(null)}
              className="rounded-full px-2.5 py-1 font-semibold text-cardinal hover:underline disabled:opacity-50"
            >
              Retirer
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className="ml-auto text-ink/40 hover:text-ink" aria-label="Fermer">
            ✕
          </button>
          {error && <p className="w-full text-cardinal-dark">{error}</p>}
        </div>
      )}
    </div>
  );
}
