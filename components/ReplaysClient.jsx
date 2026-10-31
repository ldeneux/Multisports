"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addReplay, deleteReplay } from "@/app/(protected)/replays/actions";

const SPORTS = [
  { value: "basket", label: "Basket" },
  { value: "natation", label: "Natation" },
  { value: "autre", label: "Autre" },
];

function formatDay(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ReplayForm({ matches, defaultMatchId }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [sport, setSport] = useState("basket");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e) {
    e.preventDefault();
    setError("");
    setDone(false);
    const data = new FormData(formRef.current);
    startTransition(async () => {
      const res = await addReplay(data);
      if (res?.error) {
        setError(res.error);
        return;
      }
      formRef.current?.reset();
      setSport("basket");
      setDone(true);
      router.refresh();
    });
  }

  const field = "w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3 rounded-card bg-white p-4 shadow-sm">
      <h2 className="font-display text-base font-bold text-navy">Ajouter un replay</h2>
      <input name="url" required placeholder="Lien YouTube ou Google Drive (https://…)" className={field} />
      <input name="title" placeholder="Titre (ex. Finale 50 m nage libre)" className={field} />
      <div className="grid grid-cols-2 gap-2">
        <select name="sport" value={sport} onChange={(e) => setSport(e.target.value)} className={field}>
          {SPORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input type="date" name="recorded_on" className={field} />
      </div>
      {sport === "basket" && (
        <select name="match_id" defaultValue={defaultMatchId} className={field}>
          <option value="">Rattacher à un match (facultatif)</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-cardinal px-5 py-2 text-sm font-bold text-white hover:bg-cardinal-dark disabled:opacity-60"
      >
        {pending ? "Ajout…" : "Ajouter"}
      </button>
      {error && <p className="text-sm text-cardinal-dark">{error}</p>}
      {done && <p className="text-sm text-lagoon">Replay ajouté.</p>}
    </form>
  );
}

export function ReplayList({ replays }) {
  const router = useRouter();
  const [filter, setFilter] = useState("tous");
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const shown = replays.filter((r) => filter === "tous" || r.sport === filter);

  function remove(id) {
    if (!window.confirm("Retirer ce replay de l'appli ? (la vidéo reste sur YouTube / Drive)")) return;
    setError("");
    startTransition(async () => {
      const res = await deleteReplay(id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-card bg-white p-4 shadow-sm">
      <div className="flex gap-2">
        {[["tous", "Tous"], ...SPORTS.map((s) => [s.value, s.label])].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              filter === value ? "bg-navy text-white" : "bg-sand text-ink/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="text-sm text-ink/60">Aucun replay pour l'instant.</p>}

      <ul className="space-y-4">
        {shown.map((r) => (
          <li key={r.id} className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-navy">{r.title}</p>
              <p className="text-xs text-ink/50">
                {[formatDay(r.recordedOn), r.matchLabel].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {r.embed ? (
                <button
                  type="button"
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  className="text-sm font-semibold text-lagoon hover:underline"
                >
                  {openId === r.id ? "Fermer" : "Regarder"}
                </button>
              ) : null}
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-lagoon hover:underline">
                {r.embed ? "Ouvrir dans " + (r.provider === "youtube" ? "YouTube" : "Drive") : "Ouvrir le lien"}
              </a>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={pending}
                className="text-xs font-semibold text-ink/40 hover:text-cardinal"
              >
                Retirer
              </button>
            </div>
            {r.embed && openId === r.id && (
              <iframe
                src={r.embed}
                title={r.title}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                loading="lazy"
                className="aspect-video w-full rounded-md bg-black"
              />
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-cardinal-dark">{error}</p>}
    </div>
  );
}
