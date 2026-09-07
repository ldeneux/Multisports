import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { fieldsForSlug } from "@/lib/otherSportsFields";
import AddOtherSportResultForm from "@/components/AddOtherSportResultForm";
import {
  addOtherSportResult,
  updateOtherSportResult,
  deleteOtherSportResult,
  deleteOtherSportResultFile,
} from "./actions";

export const dynamic = "force-dynamic";

function ResultFiles({ files }) {
  if (!files || files.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-1 rounded-full bg-sand px-2 py-1 text-xs">
          <a
            href={`${f.file_url}${f.file_url.includes("?") ? "&" : "?"}download=`}
            className="font-semibold text-cardinal hover:underline"
          >
            {f.file_name || "Document"}
          </a>
          <form action={deleteOtherSportResultFile}>
            <input type="hidden" name="file_id" value={f.id} />
            <button type="submit" className="text-ink/30 hover:text-cardinal">✕</button>
          </form>
        </div>
      ))}
    </div>
  );
}

function ResultEditForm({ result, sportSlug }) {
  const fields = fieldsForSlug(sportSlug);
  return (
    <form
      action={updateOtherSportResult}
      encType="multipart/form-data"
      className="mt-3 grid gap-3 rounded-card bg-sand p-3 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={result.id} />

      <label className="text-xs font-semibold text-ink/60">
        Date
        <input
          type="date"
          name="result_date"
          defaultValue={result.result_date ?? ""}
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
        />
      </label>

      <label className="text-xs font-semibold text-ink/60">
        Lien (course, site...)
        <input
          type="url"
          name="link_url"
          defaultValue={result.link_url ?? ""}
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
              defaultValue={result.details?.[f.key] ?? ""}
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
              defaultValue={result.details?.[f.key] ?? ""}
              rows={2}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          ) : (
           <input
  type={f.type}
  name={`detail__${f.key}`}
  defaultValue={result.details?.[f.key] ?? ""}
  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
  step={f.type === "number" ? "any" : undefined}
/>

          )}
        </label>
      ))}

      <label className="text-xs font-semibold text-ink/60 sm:col-span-2">
        Commentaire
        <textarea
          name="notes"
          defaultValue={result.notes ?? ""}
          rows={2}
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
        />
      </label>

      <label className="text-xs font-semibold text-ink/60 sm:col-span-2">
        Ajouter des documents (optionnel)
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
        className="rounded-full bg-navy px-5 py-2 font-semibold text-white hover:bg-navy-light sm:col-span-2 sm:w-fit"
      >
        Mettre à jour
      </button>
    </form>
  );
}

function ResultCard({ result, sportSlug }) {
  const fields = fieldsForSlug(sportSlug);

  return (
    <div className="rounded-card bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">
            {result.result_date ? formatDate(result.result_date, { weekday: false }) : "Date inconnue"}
            {result.location ? ` · ${result.location}` : ""}
          </p>
          {result.link_url && (
            <a
              href={result.link_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-cardinal hover:underline"
            >
              Voir le lien →
            </a>
          )}
        </div>
        <form action={deleteOtherSportResult}>
          <input type="hidden" name="id" value={result.id} />
          <button type="submit" className="text-xs font-semibold text-ink/30 hover:text-cardinal">
            Supprimer
          </button>
        </form>
      </div>

      {fields.some((f) => result.details?.[f.key]) && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {fields
            .filter((f) => result.details?.[f.key])
            .map((f) => (
              <div key={f.key}>
                <dt className="text-xs text-ink/40">{f.label}</dt>
                <dd className="text-ink/80">{result.details[f.key]}</dd>
              </div>
            ))}
        </dl>
      )}

      {result.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-ink/60">{result.notes}</p>}

      <ResultFiles files={result.other_sport_result_files} />

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-ink/40 hover:text-navy">
          Éditer
        </summary>
        <ResultEditForm result={result} sportSlug={sportSlug} />
      </details>
    </div>
  );
}

export default async function AutresSportsPage({ searchParams }) {
  const supabase = createClient();

  const { data: participants } = await supabase
    .from("participants")
    .select("id, first_name")
    .order("birthdate");

  const selectedParticipantId =
    (participants ?? []).find((p) => p.id === searchParams?.participant)?.id ??
    (participants ?? [])[0]?.id ??
    null;

  const { data: participantSports } = selectedParticipantId
    ? await supabase
        .from("participant_sports")
        .select("sport_id, sports(id, name, slug)")
        .eq("participant_id", selectedParticipantId)
    : { data: [] };

  const sportsForParticipant = (participantSports ?? [])
    .map((ps) => ps.sports)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data: results } = selectedParticipantId
    ? await supabase
        .from("other_sport_results")
        .select("*, sports(name, slug), other_sport_result_files(id, file_url, file_name)")
        .eq("participant_id", selectedParticipantId)
        .order("result_date", { ascending: false })
    : { data: [] };

  const bySport = {};
  (results ?? []).forEach((r) => {
    const name = r.sports?.name ?? "Sport inconnu";
    if (!bySport[name]) bySport[name] = [];
    bySport[name].push(r);
  });
  const sportNames = Object.keys(bySport).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
          Autres sports
        </h1>
        <p className="mt-1 text-ink/60">
          Plongée, triathlon, course à pied, parapente... tout ce qui sort des sports principaux.
        </p>
      </div>

      {(!participants || participants.length === 0) ? (
        <p className="rounded-card bg-white p-6 text-sm text-ink/50 shadow-sm">
          Ajoute d'abord un participant dans Paramètres.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <Link
                key={p.id}
                href={`/autres-sports?participant=${p.id}`}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  p.id === selectedParticipantId ? "bg-cardinal text-white" : "bg-white text-ink/60"
                }`}
              >
                {p.first_name}
              </Link>
            ))}
          </div>

          {sportsForParticipant.length === 0 ? (
            <p className="rounded-card bg-white p-6 text-sm text-ink/50 shadow-sm">
              Cette participante n'a pas de sport (hors sports principaux) associé — configure ça
              dans Paramètres.
            </p>
          ) : (
            <details className="rounded-card bg-white p-4 shadow-sm">
              <summary className="cursor-pointer font-display text-sm uppercase tracking-tight text-navy">
                Ajouter un résultat
              </summary>
              <AddOtherSportResultForm
                participantId={selectedParticipantId}
                participantSports={sportsForParticipant}
                action={addOtherSportResult}
              />
            </details>
          )}

          {sportNames.length === 0 ? (
            <p className="rounded-card bg-white p-6 text-sm text-ink/50 shadow-sm">
              Aucun résultat enregistré pour l'instant.
            </p>
          ) : (
            <div className="space-y-3">
              {sportNames.map((sportName) => {
                const entries = bySport[sportName];
                const slug = entries[0]?.sports?.slug;
                return (
                  <details key={sportName} open className="overflow-hidden rounded-card bg-white shadow-sm">
                    <summary className="cursor-pointer bg-navy px-4 py-2 font-display text-sm uppercase tracking-tight text-white">
                      {sportName} ({entries.length})
                    </summary>
                    <div className="space-y-3 p-3">
                      {entries.map((r) => (
                        <ResultCard key={r.id} result={r} sportSlug={slug} />
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
