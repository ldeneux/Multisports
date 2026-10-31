"use client";

import { useEffect, useRef, useState } from "react";

// Durée d'un fichier d'enregistrement local (on coupe pour ne pas saturer la
// mémoire du téléphone : un match entier d'un seul bloc est trop lourd).
const SEGMENT_MS = 10 * 60 * 1000;

function pickMime() {
  if (typeof window === "undefined" || !window.MediaRecorder) return null;
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((t) => window.MediaRecorder.isTypeSupported(t)) ?? null;
}

export default function LiveRoom({ matchId }) {
  // idle | connecting | broadcasting | watching | ended
  const [mode, setMode] = useState("idle");
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(true);
  const [saveCopy, setSaveCopy] = useState(false);
  const [segments, setSegments] = useState([]);

  const videoRef = useRef(null);
  const roomRef = useRef(null);
  const wakeRef = useRef(null);
  const recRef = useRef(null);
  const leavingRef = useRef(false);

  // ---- Écran allumé pendant le direct ------------------------------------
  async function requestWakeLock() {
    try {
      wakeRef.current = await navigator.wakeLock?.request("screen");
    } catch {
      // Non supporté ou refusé : le direct fonctionne quand même.
    }
  }
  function releaseWakeLock() {
    try {
      wakeRef.current?.release();
    } catch {}
    wakeRef.current = null;
  }

  // ---- Copie locale (replay gratuit, stocké sur le téléphone) ------------
  function nextSegment() {
    const r = recRef.current;
    if (!r?.active) return;
    r.n += 1;
    const n = r.n;
    const chunks = [];
    const recorder = new MediaRecorder(r.stream, {
      mimeType: r.mime,
      videoBitsPerSecond: 1_200_000,
      audioBitsPerSecond: 64_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      clearTimeout(r.timer);
      if (chunks.length) {
        const blob = new Blob(chunks, { type: r.mime.split(";")[0] });
        setSegments((s) => [
          ...s,
          { n, url: URL.createObjectURL(blob), ext: r.ext, mb: Math.round(blob.size / 1e6) },
        ]);
      }
      if (r.active) nextSegment();
    };
    recorder.start(10000);
    r.recorder = recorder;
    r.timer = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, SEGMENT_MS);
  }

  function startRecording(room, LK) {
    const lp = room.localParticipant;
    const cam = lp.getTrackPublication(LK.Track.Source.Camera)?.track?.mediaStreamTrack;
    const mic = lp.getTrackPublication(LK.Track.Source.Microphone)?.track?.mediaStreamTrack;
    const mime = pickMime();
    if (!cam || !mime) {
      setError("L'enregistrement sur ce téléphone n'est pas disponible avec ce navigateur (le direct continue).");
      return;
    }
    recRef.current = {
      active: true,
      stream: new MediaStream(mic ? [cam, mic] : [cam]),
      mime,
      ext: mime.startsWith("video/mp4") ? "mp4" : "webm",
      n: 0,
      recorder: null,
      timer: null,
    };
    nextSegment();
  }

  function stopRecording() {
    const r = recRef.current;
    if (!r) return;
    r.active = false;
    clearTimeout(r.timer);
    if (r.recorder?.state === "recording") r.recorder.stop();
  }

  // ---- Connexion à la salle LiveKit --------------------------------------
  async function connect(role) {
    setError("");
    setWaiting(true);
    setMode("connecting");
    leavingRef.current = false;
    try {
      const res = await fetch("/api/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible d'obtenir l'accès au direct.");

      const LK = await import("livekit-client");
      const room = new LK.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(LK.RoomEvent.TrackSubscribed, (track) => {
        if (videoRef.current) track.attach(videoRef.current);
        setWaiting(false);
      });
      room.on(LK.RoomEvent.TrackUnsubscribed, (track) => track.detach());
      room.on(LK.RoomEvent.ParticipantDisconnected, () => {
        if (role === "watch" && room.remoteParticipants.size === 0) setMode("ended");
      });
      room.on(LK.RoomEvent.Disconnected, () => {
        if (!leavingRef.current) {
          stopRecording();
          releaseWakeLock();
          setError("La connexion au direct a été perdue.");
          setMode("ended");
        }
      });

      await room.connect(data.url, data.token);

      if (role === "broadcast") {
        await room.localParticipant.setCameraEnabled(
          true,
          { facingMode: "environment", resolution: LK.VideoPresets.h720.resolution },
          { videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 24 }, simulcast: true }
        );
        await room.localParticipant.setMicrophoneEnabled(true);
        const camPub = room.localParticipant.getTrackPublication(LK.Track.Source.Camera);
        if (camPub?.track && videoRef.current) camPub.track.attach(videoRef.current);
        requestWakeLock();
        if (saveCopy) startRecording(room, LK);
        setMode("broadcasting");
      } else {
        try {
          await room.startAudio();
        } catch {}
        setWaiting(room.remoteParticipants.size === 0);
        setMode("watching");
      }
    } catch (err) {
      leavingRef.current = true;
      try {
        await roomRef.current?.disconnect();
      } catch {}
      roomRef.current = null;
      const denied = /permission|denied|NotAllowed/i.test(String(err?.message || err));
      setError(
        denied
          ? "Accès à la caméra ou au micro refusé : autorise-le dans le navigateur puis réessaie."
          : String(err?.message || err)
      );
      setMode("idle");
    }
  }

  async function leave() {
    leavingRef.current = true;
    const wasBroadcasting = mode === "broadcasting";
    stopRecording();
    releaseWakeLock();
    try {
      await roomRef.current?.disconnect();
    } catch {}
    roomRef.current = null;
    setMode(wasBroadcasting ? "ended" : "idle");
  }

  // Réactive le verrou d'écran si l'onglet revient au premier plan.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && mode === "broadcasting") requestWakeLock();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [mode]);

  // Évite de fermer la page par mégarde pendant un direct ou avec des copies non téléchargées.
  useEffect(() => {
    if (mode !== "broadcasting" && segments.length === 0) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [mode, segments.length]);

  useEffect(
    () => () => {
      leavingRef.current = true;
      stopRecording();
      releaseWakeLock();
      roomRef.current?.disconnect();
    },
    []
  );

  const live = mode === "broadcasting";
  const busy = mode === "connecting";

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-card bg-black shadow-sm">
        <video ref={videoRef} playsInline autoPlay controls={mode === "watching"} className="aspect-video w-full bg-black object-contain" />
        {live && (
          <span className="absolute left-3 top-3 rounded-full bg-cardinal px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
            ● En direct
          </span>
        )}
        {mode === "watching" && waiting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-6 text-center text-sm text-white">
            En attente du direct… La vidéo démarre dès que quelqu'un filme.
          </div>
        )}
        {mode === "ended" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-sm text-white">
            Le direct est terminé.
          </div>
        )}
        {(mode === "idle" || busy) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-sm text-white">
            {busy ? "Connexion…" : "Choisis ci-dessous : filmer ou regarder."}
          </div>
        )}
      </div>

      {error && <p className="rounded-card bg-cardinal-light p-3 text-sm text-cardinal-dark">{error}</p>}

      {(mode === "idle" || mode === "ended") && (
        <div className="space-y-3 rounded-card bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => connect("broadcast")}
              className="rounded-full bg-cardinal px-5 py-2 text-sm font-bold text-white hover:bg-cardinal-dark"
            >
              Lancer le direct
            </button>
            <button
              type="button"
              onClick={() => connect("watch")}
              className="rounded-full bg-navy px-5 py-2 text-sm font-bold text-white hover:bg-navy-light"
            >
              Regarder le direct
            </button>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={saveCopy} onChange={(e) => setSaveCopy(e.target.checked)} className="mt-1" />
            <span>
              Garder une copie sur ce téléphone (fichiers de 10 min à télécharger ensuite). Gratuit, mais plus gourmand en
              mémoire : à cocher seulement si le téléphone a de la marge.
            </span>
          </label>
          <p className="text-xs text-ink/50">
            « Lancer le direct » utilise la caméra arrière et le micro du téléphone. Garde l'écran allumé et branche le
            téléphone sur secteur si possible.
          </p>
        </div>
      )}

      {(live || mode === "watching") && (
        <button
          type="button"
          onClick={leave}
          className="rounded-full bg-ink/80 px-5 py-2 text-sm font-bold text-white hover:bg-ink"
        >
          {live ? "Terminer le direct" : "Quitter"}
        </button>
      )}

      {segments.length > 0 && (
        <div className="space-y-2 rounded-card bg-white p-4 shadow-sm">
          <h2 className="font-display text-base font-bold text-navy">Copies enregistrées sur ce téléphone</h2>
          <p className="text-xs text-ink/50">
            Télécharge-les avant de quitter cette page : elles disparaissent quand elle se ferme.
          </p>
          <ul className="space-y-1">
            {segments.map((s) => (
              <li key={s.n}>
                <a
                  href={s.url}
                  download={`match-${String(matchId).slice(0, 8)}-partie-${s.n}.${s.ext}`}
                  className="text-sm font-semibold text-lagoon hover:underline"
                >
                  Partie {s.n} ({s.mb} Mo) – télécharger
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
