import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addDocument, updateDocument, deleteDocument } from "./actions";

export const dynamic = "force-dynamic";

const KIND_STYLES = {
  diplome: {
    label: "Diplôme / brevet",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
  },
  licence: {
    label: "Licence sportive",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
  },
  certificat: {
    label: "Certificat médical",
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-800",
  },
  autre: {
    label: "Autre (baptême, stage...)",
    bg: "bg-white",
    border: "border-ink/10",
    text: "text-ink/70",
  },
};

const STATUS_ICON = {
  active: { symbol: "✓", className: "bg-emerald-500" },
  warning: { symbol: "!", className: "bg-amber-500" },
  obsolete: { symbol: "✕", className: "bg-cardinal" },
};

// Actif si pas de date (sport occasionnel, sans limite) ou date future
// au-delà de 2 mois ; warning si l'échéance arrive dans les 2 mois ;
// obsolète si dépassée.
function documentStatus(validUntil) {
  if (!validUntil) return "active";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(validUntil);
  const diffDays = Math.round((end - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "obsolete";
  if (diffDays <= 60) return "warning";
  return "active";
}

function statusTitle(status) {
  if (status === "active") return "Valide";
  if (status === "warning") return "Expire bientôt";
  return "Expiré";
}

function DocumentFormFields({ sports, doc }) {
  return (
    <>
      <select
        name="sport_id"
        defaultValue={doc?.sport_id ?? ""}
        className="rounded-lg border border-ink/15 px-3 py-2"
      >
        <option value="">Sport (optionnel)</option>
        {(sports ?? []).map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      <select
        name="kind"
        required
        defaultValue={doc?.kind ?? "diplome"}
        className="rounded-lg border border-ink/15 px-3 py-2"
      >
        {Object.entries(KIND_STYLES).map(([value, k]) => (
          <option key={value} value={value}>{k.label}</option>
        ))}
      </select>

      <input
        name="title"
        placeholder="Intitulé (ex. N° Licence : 985512)"
        required
        defaultValue={doc?.title ?? ""}
        className="rounded-lg border border-ink/15 px-3 py-2 sm:col-span-2"
      />

      <input
        name="organization"
        placeholder="Organisme / club"
        defaultValue={doc?.organization ?? ""}
        className="rounded-lg border border-ink/15 px-3 py-2"
      />

      <label className="text-xs font-semibold text-ink/60">
        Date d'obtention
        <input
          type="date"
          name="obtained_date"
          defaultValue={doc?.obtained_date ?? ""}
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
        />
      </label>

      <label className="text-xs font-semibold text-ink/60">
        Valide jusqu'au (si licence/certificat)
        <input
          type="date"
          name="valid_until"
          defaultValue={doc?.valid_until ?? ""}
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
        />
      </label>

      <label className="text-xs font-semibold text-ink/60 sm:col-span-2">
        {doc?.document_url ? "Remplacer le fichier (optionnel)" : "Photo / scan (optionnel)"}
        <input
          type="file"
          name="document"
          accept="image/*,application/pdf"
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
        />
      </label>

      <textarea
        name="notes"
        placeholder="Notes (optionnel)"
        rows={2}
        defaultValue={doc?.notes ?? ""}
        className="rounded-lg border border-ink/15 px-3 py-2 sm:col-span-2"
      />
    </>
  );
}

// Chaque action (Télécharger / Éditer / Supprimer) est indépendante — pas de
// <details> englobant toute la carte — pour qu'aucune n'interfère avec les
// autres (cliquer Supprimer ne doit jamais rouvrir/fermer le formulaire
// d'édition, et inversement).
function DocumentCard({ doc, sports }) {
  const style = KIND_STYLES[doc.kind] ?? KIND_STYLES.autre;
  const status = documentStatus(doc.valid_until);
  const icon = STATUS_ICON[status];
  const cardTitle = doc.sports?.name
    ? `${doc.sports.name.toUpperCase()} : ${style.label.split(" / ")[0].toUpperCase()}`
    : style.label.split(" / ")[0].toUpperCase();

  return (
    <div className={`relative rounded-card border p-4 shadow-sm ${style.bg} ${style.border}`}>
      <p className={`font-display text-base tracking-tight ${style.text}`}>{cardTitle}</p>
      <p className="mt-1 font-semibold text-ink">{doc.title}</p>
      {doc.organization && <p className="text-sm text-ink/60">{doc.organization}</p>}
      {doc.obtained_date && (
        <p className="text-sm text-ink/50">
          Obtenu le {formatDate(doc.obtained_date, { weekday: false })}
        </p>
      )}
      {doc.valid_until && (
        <p className="text-sm text-ink/50">
          Valide jusqu'au {formatDate(doc.valid_until, { weekday: false })}
        </p>
      )}
      {doc.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-ink/60">{doc.notes}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold">
        {doc.document_url && (
          <a
            href={doc.document_url}
            target="_blank"
            rel="noreferrer"
            className="text-cardinal hover:underline"
          >
            Télécharger
          </a>
        )}

        <details>
          <summary className="inline cursor-pointer text-ink/40 hover:text-navy">Éditer</summary>
          <form
            action={updateDocument}
            encType="multipart/form-data"
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={doc.id} />
            <DocumentFormFields sports={sports} doc={doc} />
            <button
              type="submit"
              className="rounded-full bg-navy px-5 py-2 font-semibold text-white hover:bg-navy-light sm:col-span-2 sm:w-fit"
            >
              Mettre à jour
            </button>
          </form>
        </details>

        <form action={deleteDocument}>
          <input type="hidden" name="id" value={doc.id} />
          <button type="submit" className="text-ink/40 hover:text-cardinal">
            Supprimer
          </button>
        </form>
      </div>

      <span
        title={statusTitle(status)}
        className={`absolute bottom-3 right-3 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${icon.className}`}
      >
        {icon.symbol}
      </span>
    </div>
  );
}

export default async function DocumentsPage({ searchParams }) {
  const supabase = createClient();

  const [{ data: participants }, { data: sports }] = await Promise.all([
    supabase.from("participants").select("id, first_name").order("birthdate"),
    supabase.from("sports").select("id, name").order("name"),
  ]);

  const selectedParticipantId =
    (participants ?? []).find((p) => p.id === searchParams?.participant)?.id ??
    (participants ?? [])[0]?.id ??
    null;

  const { data: documents } = selectedParticipantId
    ? await supabase
        .from("documents")
        .select("*, sports(name)")
        .eq("participant_id", selectedParticipantId)
        .order("obtained_date", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
          Documents
        </h1>
        <p className="mt-1 text-ink/60">
          Diplômes, licences et certificats, tous sports confondus.
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
                href={`/documents?participant=${p.id}`}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  p.id === selectedParticipantId ? "bg-cardinal text-white" : "bg-white text-ink/60"
                }`}
              >
                {p.first_name}
              </Link>
            ))}
          </div>

          <details className="rounded-card bg-white p-4 shadow-sm">
            <summary className="cursor-pointer font-display text-sm uppercase tracking-tight text-navy">
              Ajouter un document
            </summary>
            <form
              action={addDocument}
              encType="multipart/form-data"
              className="mt-4 grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="participant_id" value={selectedParticipantId ?? ""} />
              <DocumentFormFields sports={sports} />
              <button
                type="submit"
                className="rounded-full bg-cardinal px-5 py-2 font-semibold text-white hover:bg-cardinal-dark sm:col-span-2 sm:w-fit"
              >
                Enregistrer
              </button>
            </form>
          </details>

          <section className="grid gap-4 sm:grid-cols-2">
            {(!documents || documents.length === 0) ? (
              <p className="rounded-card bg-white p-6 text-sm text-ink/50 shadow-sm sm:col-span-2">
                Aucun document enregistré pour l'instant.
              </p>
            ) : (
              documents.map((d) => <DocumentCard key={d.id} doc={d} sports={sports} />)
            )}
          </section>
        </>
      )}
    </div>
  );
}
