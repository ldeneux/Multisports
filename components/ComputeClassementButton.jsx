"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeClassement } from "@/app/(protected)/basket/actions";

export default function ComputeClassementButton({ phaseId }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setMessage("");
    startTransition(async () => {
      const res = await computeClassement(phaseId);
      setIsError(Boolean(res?.error));
      setMessage(res?.error ?? res?.message ?? "");
      if (!res?.error) router.refresh();
    });
  }

  return (
    <div className="space-y-1 text-right">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-full bg-lagoon px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Calcul…" : "Calculer le classement"}
      </button>
      {message && <p className={`text-xs ${isError ? "text-cardinal-dark" : "text-ink/50"}`}>{message}</p>}
    </div>
  );
}
