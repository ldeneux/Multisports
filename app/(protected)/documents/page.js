import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addDocument, deleteDocument } from "./actions";

export const dynamic = "force-dynamic";

const KINDS = [
  { value: "diplome", label: "Diplôme / brevet" },
  { value: "licence", label: "Licence sportive" },
  { value: "certificat", label: "Certificat médical" },
  { value: "autre", label: "Autre (baptême, stage...)" },
];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default async function DocumentsPage() {
  const supabase = createClient();

  const [{ data: participants }, { data: sports }, { data: documents }] = await Promise.all([
    supabase.from("participants").select("id, first_name").order("birthdate"),
    supabase.from("sports").select("id, name").order("name"),
    supabase
      .from("documents")
      .select("*, participants(first_name), sports(name)")
      .order("obtained_date", { ascending: false }),
  ]);

  const expiringSoon = (documents ?? []).filter((d) => {
    const days = daysUntil(d.valid_until);
    return days !== null && days <= 60;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
          Documents
        </h1>
        <p className="mt-1 text-ink/60">
          Diplômes, licences et certificats, tous sports confondus.
        </p>
      </div>

      {expiringSoon.length > 0 && (
        <section className="rounded-card bg-cardinal-light p-4">
          <p className="font-semibold text-cardinal-dark">
            {expiringSoon.length === 1 ? "Un document expire bientôt :" : "Des documents expirent bientôt :"}
          </p>
          <ul className="mt-1 text-sm text-cardinal-dark">
            {expiringSoon.map((d) => (
              <li key={d.id}>
                {d.participants?.first_name} · {d.title} — {formatDate(d.valid_until, { weekday: false })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-card bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-display text-lg uppercase tracking-tight text-navy">
          Ajouter un document
        </h2>
        {(!participants || participants.length === 0) ? (
          <p className="text-sm text-ink/50">
            Ajoute d'abord un participant dans Paramètres.
          </p>
        ) : (
          <form action={addDocument} className="grid gap-3 sm:grid-cols-2" encType="multipart/form-data">
            <select name="participant_id" required className="rounded-lg border border-ink/15 px-3 py-2">
              <option value="">Participant</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.first_name}</option>
              ))}
            </select>

            <select name="sport_id" className="rounded-lg border border-ink/15 px-3 py-2">
              <option value="">Sport (optionnel)</option>
              {(sports ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <select name="kind" required className="rounded-lg border border-ink/15 px-3 py-2 sm:col-span-2">
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>

            <input
              name="title" placeholder="Intitulé (ex. Niveau 1 plongée, Baptême...)" required
              className="rounded-lg border border-ink/15 px-3 py-2 sm:col-span-2"
            />

            <input
              name="organization" placeholder="Organisme / club"
              className="rounded-lg border border-ink/15 px-3 py-2"
            />

            <label className="text-xs font-semibold text-ink/60">
              Date d'obtention
              <input
                type="date" name="obtained_date"
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
              />
            </label>

            <label className="text-xs font-semibold text-ink/60">
              Valide jusqu'au (si licence/certificat)
              <input
                type="date" name="valid_until"
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
              />
            </label>

            <label className="text-xs font-semibold text-ink/60 sm:col-span-2">
              Photo / scan (optionnel)
              <input
                type="file" name="document" accept="image/*,application/pdf"
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
              />
            </label>

            <textarea
              name="notes" placeholder="Notes (optionnel)" rows={2}
              className="rounded-lg border border-ink/15 px-3 py-2 sm:col-span-2"
            />

            <button
              type="submit"
              className="rounded-full bg-navy px-5 py-2 font-semibold text-white hover:bg-navy-light sm:col-span-2 sm:w-fit"
            >
              Enregistrer
            </button>
          </form>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {(!documents || documents.length === 0) ? (
          <p className="rounded-card bg-white p-6 text-sm text-ink/50 shadow-sm sm:col-span-2">
            Aucun document enregistré pour l'instant.
          </p>
        ) : (
          documents.map((d) => (
            <div key={d.id} className="rounded-card bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-lagoon">
                  {d.sports?.name ?? "Général"}
                </p>
                <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-ink/50">
                  {d.participants?.first_name}
                </span>
              </div>
              <p className="mt-1 font-display text-lg text-navy">{d.title}</p>
              {d.organization && <p className="text-sm text-ink/60">{d.organization}</p>}
              {d.obtained_date && (
                <p className="text-sm text-ink/50">
                  Obtenu le {formatDate(d.obtained_date, { weekday: false })}
                </p>
              )}
              {d.valid_until && (
                <p className="text-sm text-ink/50">
                  Valide jusqu'au {formatDate(d.valid_until, { weekday: false })}
                </p>
              )}
              {d.document_url && (
                <a
                  href={d.document_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-semibold text-cardinal hover:underline"
                >
                  Voir le document
                </a>
              )}
              {d.notes && <p className="mt-2 text-sm text-ink/60">{d.notes}</p>}

              <form action={deleteDocument} className="mt-3">
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="text-xs font-semibold text-ink/40 hover:text-cardinal">
                  Supprimer
                </button>
              </form>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
