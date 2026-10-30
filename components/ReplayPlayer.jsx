"use client";

import { useEffect, useRef, useState } from "react";
import { Repeat, Play, Flag, Trash2 } from "lucide-react";
import { formatTime } from "@/lib/video";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Charge l'API du lecteur YouTube une seule fois pour toute la session.
let ytPromise = null;
function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytPromise) {
    ytPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (previous) previous();
        resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    });
  }
  return ytPromise;
}

/**
 * Lecteur de replay : YouTube (lien) ou fichier envoyé.
 * - « passages » : un extrait (début → fin) qui tourne en boucle quand on le choisit ;
 * - boucle sur toute la vidéo, vitesse (0,5× à 2×) ;
 * - pour créer un passage : « Début » / « Fin » prennent le temps actuel de la vidéo.
 */
export default function ReplayPlayer({ video, moments, addMoment, deleteMoment }) {
  const isYouTube = video.source === "youtube" && !!video.youtube_id;
  const isFile = video.source === "file" && !!video.url;

  const hostRef = useRef(null);
  const ytRef = useRef(null);
  const fileRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loopAll, setLoopAll] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [now, setNow] = useState(0);
  const [form, setForm] = useState({ label: "", start: "", end: "" });

  const active = moments.find((m) => m.id === activeId) ?? null;
  const activeRef = useRef(null);
  const loopAllRef = useRef(false);
  const speedRef = useRef(1);
  activeRef.current = active;
  loopAllRef.current = loopAll;
  speedRef.current = speed;

  const getTime = () => (isYouTube ? ytRef.current?.getCurrentTime?.() ?? 0 : fileRef.current?.currentTime ?? 0);
  const seek = (t) => {
    if (isYouTube) ytRef.current?.seekTo?.(t, true);
    else if (fileRef.current) fileRef.current.currentTime = t;
  };
  const play = () => {
    if (isYouTube) ytRef.current?.playVideo?.();
    else fileRef.current?.play?.();
  };

  // Lecteur YouTube
  useEffect(() => {
    if (!isYouTube) return;
    let cancelled = false;
    let player = null;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const el = document.createElement("div");
        hostRef.current.appendChild(el);
        player = new YT.Player(el, {
          videoId: video.youtube_id,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              ytRef.current = player;
              setReady(true);
            },
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.PLAYING) player.setPlaybackRate?.(speedRef.current);
              // Fin de la vidéo : on recommence si la boucle est active
              if (e.data === YT.PlayerState.ENDED && loopAllRef.current) {
                player.seekTo(0, true);
                player.playVideo();
              }
            },
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      try {
        player?.destroy?.();
      } catch {}
      ytRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
      setReady(false);
    };
  }, [isYouTube, video.youtube_id]);

  useEffect(() => {
    if (isFile) setReady(true);
  }, [isFile]);

  // Vitesse
  useEffect(() => {
    if (isYouTube) ytRef.current?.setPlaybackRate?.(speed);
    else if (fileRef.current) fileRef.current.playbackRate = speed;
  }, [speed, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Surveillance du temps : boucle du passage choisi + affichage du temps actuel
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const t = getTime();
      setNow((prev) => (Math.floor(t) !== prev ? Math.floor(t) : prev));
      const a = activeRef.current;
      if (!a) return;
      const start = Number(a.start_sec);
      const end = a.end_sec === null ? null : Number(a.end_sec);
      if (end !== null && t >= end) seek(start); // fin du passage : on revient au début
      else if (t < start - 1.5 || (end !== null && t > end + 2)) setActiveId(null); // on a déplacé la vidéo ailleurs : fin de la boucle
    }, 200);
    return () => clearInterval(id);
  }, [ready, isYouTube]); // eslint-disable-line react-hooks/exhaustive-deps

  function startMoment(m) {
    setActiveId(m.id);
    seek(Number(m.start_sec));
    play();
  }

  const input = "rounded-lg border border-ink/15 px-3 py-2";

  return (
    <div className="space-y-4">
      {isYouTube && (
        <div className="aspect-video w-full overflow-hidden rounded-card bg-black shadow-sm">
          <div ref={hostRef} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
        </div>
      )}
      {isFile && (
        <video
          ref={fileRef}
          src={video.url}
          controls
          playsInline
          loop={loopAll && !active}
          className="aspect-video w-full rounded-card bg-black shadow-sm"
        />
      )}
      {!isYouTube && !isFile && (
        <div className="rounded-card bg-white p-6 shadow-sm">
          <p className="text-sm text-ink/60">
            Ce lien n'est pas une vidéo YouTube ou un fichier : il s'ouvre dans un autre onglet (la lecture en boucle et les
            passages ne sont pas disponibles).
          </p>
          {video.url && (
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-full bg-navy px-5 py-2 font-semibold text-white hover:bg-navy-light"
            >
              Ouvrir la vidéo
            </a>
          )}
        </div>
      )}

      {(isYouTube || isFile) && (
        <>
          {/* Commandes : boucle et vitesse */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => setLoopAll((v) => !v)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                loopAll ? "bg-cardinal text-white" : "bg-sand text-ink/70 hover:bg-lagoon-light"
              }`}
            >
              <Repeat size={16} /> Boucle sur toute la vidéo {loopAll ? "activée" : ""}
            </button>

            <div className="flex items-center gap-1 text-sm">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink/40">Vitesse</span>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    speed === s ? "bg-navy text-white" : "bg-sand text-ink/60 hover:bg-lagoon-light"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>

            <span className="ml-auto text-xs text-ink/40">Temps : {formatTime(now) || "0:00"}</span>
          </div>

          {/* Passages à revoir en boucle */}
          <div className="rounded-card bg-white p-4 shadow-sm">
            <h2 className="font-display text-sm uppercase tracking-tight text-navy">Passages à revoir</h2>

            {moments.length === 0 ? (
              <p className="mt-2 text-sm text-ink/50">
                Aucun passage pour l'instant. Ajoute le moment d'une course ou d'un beau panier ci-dessous : un clic suffira
                ensuite pour le revoir en boucle.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {moments.map((m) => {
                  const isActive = m.id === activeId;
                  return (
                    <li
                      key={m.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                        isActive ? "border-cardinal bg-cardinal-light/40" : "border-ink/10"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => (isActive ? setActiveId(null) : startMoment(m))}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${
                          isActive ? "bg-cardinal" : "bg-navy hover:bg-navy-light"
                        }`}
                        title={isActive ? "Arrêter la boucle" : "Revoir en boucle"}
                      >
                        {isActive ? <Repeat size={16} /> : <Play size={16} />}
                      </button>
                      <button type="button" onClick={() => startMoment(m)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-semibold text-ink">{m.label}</span>
                        <span className="text-xs text-ink/50">
                          {formatTime(m.start_sec)}
                          {m.end_sec !== null ? ` → ${formatTime(m.end_sec)}` : " → fin"}
                          {isActive ? " · en boucle" : ""}
                        </span>
                      </button>
                      <form action={deleteMoment}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="video_id" value={video.id} />
                        <button type="submit" className="text-ink/30 hover:text-cardinal" title="Supprimer ce passage">
                          <Trash2 size={16} />
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Nouveau passage */}
            <form
              action={async (formData) => {
                await addMoment(formData);
                setForm({ label: "", start: "", end: "" });
              }}
              className="mt-4 grid gap-3 border-t border-ink/10 pt-4 sm:grid-cols-[1fr_auto_auto]"
            >
              <input type="hidden" name="video_id" value={video.id} />
              <input
                name="label"
                required
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Nom du passage (ex. 50 m nage libre)"
                className={`${input} sm:col-span-3`}
              />
              <div className="flex items-center gap-2">
                <input
                  name="start"
                  required
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                  placeholder="Début 12:30"
                  className={`${input} w-32`}
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, start: formatTime(getTime()) })}
                  className="flex items-center gap-1 rounded-full bg-sand px-3 py-2 text-xs font-semibold text-ink/70 hover:bg-lagoon-light"
                  title="Prendre le temps actuel de la vidéo"
                >
                  <Flag size={14} /> Maintenant
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  name="end"
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                  placeholder="Fin 13:45"
                  className={`${input} w-32`}
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, end: formatTime(getTime()) })}
                  className="flex items-center gap-1 rounded-full bg-sand px-3 py-2 text-xs font-semibold text-ink/70 hover:bg-lagoon-light"
                  title="Prendre le temps actuel de la vidéo"
                >
                  <Flag size={14} /> Maintenant
                </button>
              </div>
              <button
                type="submit"
                className="rounded-full bg-cardinal px-5 py-2 font-semibold text-white hover:bg-cardinal-dark sm:w-fit"
              >
                Ajouter le passage
              </button>
              <p className="text-xs text-ink/40 sm:col-span-3">
                Astuce : mets la vidéo en pause au bon endroit, puis appuie sur « Maintenant » à côté de Début, avance jusqu'à la
                fin du passage et fais pareil pour Fin. Sans fin, le passage va jusqu'à la fin de la vidéo.
              </p>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
