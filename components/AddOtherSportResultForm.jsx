"use client";

import { useState } from "react";
import { fieldsForSlug } from "@/lib/otherSportsFields";

export default function AddOtherSportResultForm({ participantId, participantSports, action }) {
  const [sportId, setSportId] = useState("");

  const selected = participantSports.find((s) => s.id === sportId);
  const fields = selected ? fieldsForSlug(selected.slug) : [];

  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2" encType="multipart/form-data">
      <input type="hidden" name="participant_id" value={participantId} />

      <select
        name="sport_id"
        required
        value={sportId}
        onChange={(e) => setSportId(e.target.value)}
        className="rounded-lg border border-ink/15 px-3 py-2 sm:col-span-2"
      >
        <option value="">Choisir un sport...</option>
        {participantSports.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {sportId && (
        <>
          <label className="text-xs font-semibold text-ink/60">
            Date
            <input
              type="date"
              name="result_date"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>

          <label className="text-xs font-semibold text-ink/60">
            Lien (course, site...)
            <input
              type="url"
              name="link_url"
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>

          {fields.map((f) => (
            <label key={f.key} className="text-xs font-semibold text-ink/60">
              {f.label}
              {f.type === "select" ? (
                <select
                  name={`detail__${f.key}`}
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
                >
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  name={`detail__${f.key}`}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
                />
              ) : (
                <input
                  type={f.type}
                  step={f.type === "number" ? "any" : undefined}
                  name={`detail__${f.key}`}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
                />
              )}
            </label>
          ))}

          <label className="text-xs font-semibold text-ink/60 sm:col-span-2">
            Commentaire
            <textarea
              name="notes"
              rows={2}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>

          <label className="text-xs font-semibold text-ink/60 sm:col-span-2">
            Documents (photo du tampon, carte, attestation... — plusieurs possibles)
            <input
              type="file"
              name="documents"
              multiple
              accept="image/*,application/pdf"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="rounded-full bg-cardinal px-5 py-2 font-semibold text-white hover:bg-cardinal-dark sm:col-span-2 sm:w-fit"
          >
            Enregistrer
          </button>
        </>
      )}
    </form>
  );
}
