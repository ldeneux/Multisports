"use client";

import { useEffect, useState } from "react";

// Une ligne du calendrier global. Double-clic (ou bouton ⓘ sur téléphone) = fiche détaillée.
export default function CalendarEvent({ event }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const { detail } = event;
  const show = () => detail && setOpen(true);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onDoubleClick={show}
        onKeyDown={(e) => e.key === "Enter" && show()}
        title={detail ? "Double-clic pour le détail" : undefined}
        className="flex cursor-pointer touch-manipulation select-none items-center gap-2 rounded-lg px-3 py-2 text-white"
        style={{ backgroundColor: event.color }}
      >
        <span className="w-5 shrink-0 text-center text-base" aria-hidden="true">
          {event.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{event.title}</span>
          <span className="block truncate text-xs text-white/75">{event.subtitle}</span>
        </span>
        {detail && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              show();
            }}
            aria-label="Voir le détail"
            className="shrink-0 rounded-full bg-white/20 px-2 text-xs font-bold hover:bg-white/30"
          >
            ⓘ
          </button>
        )}
      </div>

      {open && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={event.title}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card p-5 shadow-xl"
            style={{ backgroundColor: detail.kind === "swim" ? "#F7B77F" : "#FFFFFF" }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="absolute right-3 top-3 h-8 w-8 rounded-full bg-black/10 text-lg font-bold hover:bg-black/20"
            >
              ×
            </button>
            {detail.kind === "basket" && <BasketDetail d={detail} />}
            {detail.kind === "swim" && <SwimDetail d={detail} />}
            {detail.kind === "other" && <OtherDetail d={detail} />}
          </div>
        </div>
      )}
    </>
  );
}

function Address({ lines, mapsUrl, note, light }) {
  if (!lines?.length && !mapsUrl) return null;
  return (
    <div className={`space-y-1 text-center text-sm ${light ? "text-white" : "text-ink/80"}`}>
      {lines?.map((line, i) => (
        <p key={line} className={i === 0 ? "font-semibold" : ""}>
          {line}
        </p>
      ))}
      {note && <p className={`text-xs ${light ? "text-white/80" : "text-ink/50"}`}>{note}</p>}
      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-full bg-lagoon px-4 py-1.5 text-xs font-bold text-white hover:opacity-90"
        >
          📍 Itinéraire
        </a>
      )}
    </div>
  );
}

// ---- Basket : même présentation que la fiche de match de la FFBB ----------
function Crest({ src, name }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} className="h-24 w-24 object-contain sm:h-32 sm:w-32" />
  ) : (
    <span className="flex h-24 w-24 items-center justify-center rounded-full bg-sand text-3xl sm:h-32 sm:w-32">🏀</span>
  );
}

function ScoreBox({ value, winner }) {
  return (
    <span
      className={`flex h-14 w-14 items-center justify-center rounded-lg text-3xl ${
        winner ? "bg-[#00C27A] text-white" : "bg-[#F1F3F8] text-navy"
      }`}
    >
      {value ?? "–"}
    </span>
  );
}

function BasketDetail({ d }) {
  const win1 = d.played && d.score1 > d.score2;
  const win2 = d.played && d.score2 > d.score1;
  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="inline-block rounded-full bg-[#FFD08A] px-4 py-1 text-sm text-navy">BASKET 🏀</span>
      </div>
      {d.competition && <p className="text-center text-sm text-navy underline">{d.competition}</p>}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <h2 className="text-lg font-extrabold uppercase leading-tight text-navy sm:text-2xl">{d.team1}</h2>
        <span className="text-xs font-bold text-navy sm:text-sm">contre</span>
        <h2 className="text-right text-lg font-extrabold uppercase leading-tight text-navy sm:text-2xl">{d.team2}</h2>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-3">
          <Crest src={d.logo1} name={d.team1} />
          {d.usIsTeam1 && d.category && <span className="text-sm text-navy">{d.category}</span>}
        </div>
        <div className="flex items-center gap-3">
          <ScoreBox value={d.score1} winner={win1} />
          <ScoreBox value={d.score2} winner={win2} />
        </div>
        <div className="flex items-center justify-end gap-3">
          {d.usIsTeam1 === false && d.category && <span className="text-sm text-navy">{d.category}</span>}
          <Crest src={d.logo2} name={d.team2} />
        </div>
      </div>

      <p className="text-center text-sm text-navy">{d.dateText}</p>
      <Address lines={d.addressLines} mapsUrl={d.mapsUrl} note={d.addressNote} />
    </div>
  );
}

// ---- Natation : fiche de compétition ---------------------------------------
function SwimDetail({ d }) {
  return (
    <div className="space-y-4 text-white">
      <p className="font-mono text-xs text-navy">{d.dateText}</p>
      <div className="flex items-center gap-4">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border-4 border-white bg-white">
          {d.clubLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.clubLogo} alt={d.clubName ?? "Club organisateur"} className="h-full w-full object-contain" />
          ) : (
            <span className="text-5xl">🏊</span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-xl font-extrabold leading-tight drop-shadow sm:text-3xl">{d.title}</h2>
          {d.poolLength && <p className="mt-1 text-base italic text-white/90">Bassin de {d.poolLength}m</p>}
          {d.city && <p className="mt-1 text-2xl font-extrabold uppercase tracking-wide drop-shadow">{d.city}</p>}
        </div>
      </div>

      {d.level && (
        <span className="inline-block rounded-full bg-[#F28C28] px-3 py-1 text-xs font-bold text-white">{d.level}</span>
      )}
      {d.clubName && <p className="text-center text-sm text-navy">Club organisateur : {d.clubName}</p>}
      {d.comment && <p className="rounded-md bg-white/30 p-2 text-sm text-navy">{d.comment}</p>}

      <Address lines={d.addressLines} mapsUrl={d.mapsUrl} note={d.addressNote} light />
      {d.ffnLink && (
        <div className="text-center">
          <a
            href={d.ffnLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white hover:bg-navy-light"
          >
            Voir sur le site FFN
          </a>
        </div>
      )}
    </div>
  );
}

function OtherDetail({ d }) {
  return (
    <div className="space-y-3 text-center">
      <h2 className="text-xl font-extrabold text-navy">{d.title}</h2>
      <p className="text-sm text-navy">{d.dateText}</p>
      <Address lines={d.addressLines} mapsUrl={d.mapsUrl} />
    </div>
  );
}
