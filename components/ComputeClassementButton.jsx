"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeClassement } from "@/app/(protected)/basket/actions";

const SCORINGS = [
  { value: "21", label: "Barème : victoire 2 · défaite 1" },
  { value: "321", label: "Barème : victoire 3 · nul 2 · défaite 1" },
];

export default function ComputeClassementButton({ phaseId, defaultScoring = "21" }) {
  const router = useRouter();
  const [scoring, setScoring] = useState(defaultScoring);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setMessage("");
    startTransition(async () => {
      const res = await computeClassement(phaseId, scoring);
      setIsError(Boolean(res?.error));
      setMessage(res?.error ?? res?.message ?? "");
      if (!res?.error) router.refresh();
    });
  }

  return (
    <div className="space-y-1 text-right">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={scoring}
          onChange={(e) => setScoring(e.target.value)}
          aria-label="Barème des points"
          className="rounded-full border-0 bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 shadow-sm"
        >
          {SCORINGS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="rounded-full bg-lagoon px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Calcul…" : "Calculer le classement"}
        </button>
      </div>
      {message && <p className={`text-xs ${isError ? "text-cardinal-dark" : "text-ink/50"}`}>{message}</p>}
    </div>
  );
}
