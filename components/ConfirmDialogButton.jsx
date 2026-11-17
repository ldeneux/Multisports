"use client";

import { useEffect, useRef, useState } from "react";

// Bouton de suppression avec une vraie fenêtre de confirmation (à la place du « msgbox » du navigateur) qui
// rappelle CE qu'on s'apprête à supprimer. À placer DANS un <form> : le bouton « Supprimer » de la fenêtre
// soumet ce formulaire. `name` = ce qui est supprimé (en gras), `details` = lignes d'information en dessous.
export default function ConfirmDialogButton({
  children,
  className,
  title = "Supprimer cette ligne ?",
  name,
  details = [],
  confirmLabel = "Supprimer",
  cancelLabel = "Annuler",
}) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus(); // le bouton sûr (Annuler) a le focus par défaut
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-card bg-white p-5 shadow-xl">
            <h2 className="font-display text-lg text-navy">{title}</h2>
            {name && (
              <p className="mt-3 rounded-lg bg-cardinal-light px-3 py-2 text-sm font-semibold text-cardinal-dark break-words">
                {name}
              </p>
            )}
            {details.filter(Boolean).length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-ink/60">
                {details.filter(Boolean).map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink/50">Cette action est définitive.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-sand px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/10"
              >
                {cancelLabel}
              </button>
              <button type="submit" className="rounded-full bg-cardinal px-4 py-1.5 text-sm font-semibold text-white hover:bg-cardinal-dark">
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
