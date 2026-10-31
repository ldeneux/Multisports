"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MuxPlayer from "@mux/mux-player-react";
import { createLiveStream, deleteReplay, revealBroadcastSettings } from "@/app/(protected)/direct/actions";

function formatWhen(ms) {
  return new Date(ms).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds) {
  const min = Math.round(seconds / 60);
  return min < 1 ? `${seconds} s` : `${min} min`;
}

// ---- Direct en cours (ou message d'attente) ------------------------------
export function LivePlayer({ playbackId, initialActive }) {
  const [active, setActive] = useState(initialActive);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/mux/status", { cache: "no-store" });
        if (res.ok) setActive((await res.json()).active);
      } catch {
        // Réseau coupé : on réessaie au prochain tour.
      }
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  if (!active || !playbackId) {
    return (
      <div className="rounded-card bg-white p-4 text-sm text-ink/70 shadow-sm">
        Aucun direct en cours. Cette page se met à jour toute seule dès qu'un direct démarre.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <span className="inline-block rounded-full bg-cardinal px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
        ● En direct
      </span>
      <MuxPlayer
        streamType="live"
        playbackId={playbackId}
        autoPlay="muted"
        metadata={{ video_title: "Direct Sport Famille" }}
        style={{ width: "100%", aspectRatio: "16 / 9" }}
      />
    </div>
  );
}

// ---- Réglages à copier dans l'appli de streaming du téléphone ------------
function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-ink/60">{label}</p>
      <div className="flex gap-2">
        <input readOnly value={value} className="min-w-0 flex-1 rounded-md border border-ink/15 bg-sand px-2 py-1 text-xs" />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
          className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-white hover:bg-navy-light"
        >
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
    </div>
  );
}

export function BroadcastPanel() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError("");
    startTransition(async () => {
      const res = await revealBroadcastSettings();
      if (res.error) setError(res.error);
      else setSettings(res);
    });
  }

  return (
    <div className="space-y-3 rounded-card bg-white p-4 shadow-sm">
      <h2 className="font-display text-base font-bold text-navy">Filmer un direct</h2>
      {!settings ? (
        <>
          <p className="text-sm text-ink/70">
            Mux reçoit la vidéo depuis une appli de streaming gratuite sur le téléphone (par exemple « Larix
            Broadcaster »). Il suffit de la configurer une fois avec les deux informations ci-dessous.
          </p>
          <button
            type="button"
            onClick={reveal}
            disabled={pending}
            className="rounded-full bg-cardinal px-5 py-2 text-sm font-bold text-white hover:bg-cardinal-dark disabled:opacity-60"
          >
            {pending ? "Chargement…" : "Afficher les réglages de diffusion"}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <CopyField label="Adresse du serveur" value={settings.url} />
          <CopyField label="Clé de diffusion (secrète : ne la partage pas)" value={settings.key} />
          <CopyField label="Adresse complète (si l'appli n'a qu'un seul champ)" value={`${settings.url}/${settings.key}`} />
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/70">
            <li>Dans l'appli de streaming, crée une connexion avec ces valeurs.</li>
            <li>Lance la diffusion : la vidéo apparaît ici avec environ 5 à 30 secondes de retard.</li>
            <li>Arrête la diffusion à la fin : le replay est créé tout seul et apparaît plus bas.</li>
          </ol>
          <p className="text-xs text-ink/50">
            Mux facture les minutes pendant lesquelles la diffusion est connectée : coupe-la entre deux épreuves.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-cardinal-dark">{error}</p>}
    </div>
  );
}

// ---- Replays --------------------------------------------------------------
export function ReplayList({ replays }) {
  const router = useRouter();
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function remove(id) {
    if (!window.confirm("Supprimer ce replay définitivement ?")) return;
    setError("");
    startTransition(async () => {
      const res = await deleteReplay(id);
      if (res.error) setError(res.error);
      else {
        if (openId === id) setOpenId(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 rounded-card bg-white p-4 shadow-sm">
      <h2 className="font-display text-base font-bold text-navy">Replays</h2>
      {replays.length === 0 && <p className="text-sm text-ink/60">Aucun replay pour l'instant.</p>}
      <ul className="space-y-3">
        {replays.map((r) => (
          <li key={r.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-navy">{formatWhen(r.createdAt)}</span>
              <span className="text-xs text-ink/50">{formatDuration(r.duration)}</span>
              <button
                type="button"
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                className="text-sm font-semibold text-lagoon hover:underline"
              >
                {openId === r.id ? "Fermer" : "Regarder"}
              </button>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={pending}
                className="text-xs font-semibold text-ink/40 hover:text-cardinal"
              >
                Supprimer
              </button>
            </div>
            {openId === r.id && (
              <MuxPlayer
                streamType="on-demand"
                playbackId={r.playbackId}
                metadata={{ video_title: `Replay ${formatWhen(r.createdAt)}` }}
                style={{ width: "100%", aspectRatio: "16 / 9" }}
              />
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-cardinal-dark">{error}</p>}
      <p className="text-xs text-ink/50">
        Les replays sont stockés chez Mux et comptent dans la facture : supprime ceux dont tu n'as plus besoin.
      </p>
    </div>
  );
}

// ---- Première utilisation : création du flux ------------------------------
export function CreateStreamCard() {
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3 rounded-card bg-white p-4 shadow-sm">
      <p className="font-semibold text-navy">Dernière étape : créer le flux de diffusion.</p>
      <p className="text-sm text-ink/70">
        Cette étape ne se fait qu'une fois. Le même flux sert ensuite pour tous les directs.
      </p>
      {!result?.id && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setResult(await createLiveStream());
            })
          }
          className="rounded-full bg-cardinal px-5 py-2 text-sm font-bold text-white hover:bg-cardinal-dark disabled:opacity-60"
        >
          {pending ? "Création…" : "Créer le flux"}
        </button>
      )}
      {result?.error && <p className="text-sm text-cardinal-dark">{result.error}</p>}
      {result?.id && (
        <div className="space-y-2">
          <CopyField label="MUX_LIVE_STREAM_ID" value={result.id} />
          <p className="text-sm text-ink/70">
            Ajoute cette valeur dans les variables d'environnement Vercel sous le nom <code>MUX_LIVE_STREAM_ID</code>,
            puis redéploie. Ne clique pas une deuxième fois sur « Créer le flux », sinon un second flux sera créé.
          </p>
          {result.simplified && (
            <p className="text-xs text-ink/50">
              Mux a refusé les options « faible latence » et « coupure à 2 h » : le flux a été créé sans elles. Un direct
              oublié ne s'arrête alors qu'au bout de 12 h.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
