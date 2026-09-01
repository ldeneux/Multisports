import { createClient } from "@/lib/supabase/server";
import {
  addParticipant,
  updateParticipant,
  deleteParticipant,
  addSport,
  deleteSport,
  addAssignment,
  updateAssignment,
  deleteAssignment,
} from "./actions";

export const dynamic = "force-dynamic";

const SEX_OPTIONS = [
  { value: "F", label: "Fille" },
  { value: "M", label: "Garçon" },
  { value: "Autre", label: "Autre" },
];

function ParticipantRow({ p }) {
  return (
    <form
      action={updateParticipant}
      className="grid grid-cols-2 gap-2 rounded-card bg-sand p-3 sm:grid-cols-6 sm:items-end"
    >
      <input type="hidden" name="id" value={p.id} />

      <label className="text-xs font-semibold text-ink/60">
        Prénom
        <input
          name="first_name" defaultValue={p.first_name} required
          className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
        />
      </label>

      <label className="text-xs font-semibold text-ink/60">
        Nom
        <input
          name="last_name" defaultValue={p.last_name ?? ""}
          className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
        />
      </label>

      <label className="text-xs font-semibold text-ink/60">
        Sexe
        <select
          name="sex" defaultValue={p.sex ?? ""}
          className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
        >
          <option value="">—</option>
          {SEX_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="text-xs font-semibold text-ink/60">
        Date de naissance
        <input
          type="date" name="birthdate" defaultValue={p.birthdate ?? ""}
          className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
        />
      </label>

      <button
        type="submit"
        className="rounded-full bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-light"
      >
        Enregistrer
      </button>

      <button
        type="submit"
        formAction={deleteParticipant}
        className="rounded-full px-3 py-1.5 text-sm font-semibold text-cardinal hover:bg-cardinal-light"
      >
        Supprimer
      </button>
    </form>
  );
}

export default async function ParametresPage() {
  const supabase = createClient();

  const [{ data: participants }, { data: sports }, { data: assignments }] = await Promise.all([
    supabase.from("participants").select("*").order("birthdate"),
    supabase.from("sports").select("*").order("is_main", { ascending: false }).order("name"),
    supabase
      .from("participant_sports")
      .select("*, participants(first_name), sports(name)")
      .order("created_at"),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
          Paramètres
        </h1>
        <p className="mt-1 text-ink/60">
          Configure les participants, les sports, et qui pratique quoi.
        </p>
      </div>

      {/* ---------------- Participants ---------------- */}
      <section>
        <h2 className="mb-3 font-display text-xl uppercase tracking-tight text-navy">
          Participants
        </h2>

        <div className="space-y-2">
          {(participants ?? []).length === 0 ? (
            <p className="rounded-card bg-white p-4 text-sm text-ink/50 shadow-sm">
              Aucun participant pour l'instant — ajoute-en un ci-dessous.
            </p>
          ) : (
            participants.map((p) => <ParticipantRow key={p.id} p={p} />)
          )}
        </div>

        <div className="mt-4 rounded-card bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-ink">Ajouter un participant</h3>
          <form action={addParticipant} className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
            <label className="text-xs font-semibold text-ink/60">
              Prénom
              <input
                name="first_name" required
                className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
              />
            </label>
            <label className="text-xs font-semibold text-ink/60">
              Nom
              <input
                name="last_name"
                className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
              />
            </label>
            <label className="text-xs font-semibold text-ink/60">
              Sexe
              <select name="sex" className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5">
                <option value="">—</option>
                {SEX_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-ink/60">
              Date de naissance
              <input
                type="date" name="birthdate"
                className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-cardinal px-4 py-2 text-sm font-semibold text-white hover:bg-cardinal-dark"
            >
              Ajouter
            </button>
          </form>
        </div>
      </section>

      {/* ---------------- Sports ---------------- */}
      <section>
        <h2 className="mb-3 font-display text-xl uppercase tracking-tight text-navy">
          Sports
        </h2>

        <div className="flex flex-wrap gap-2">
          {(sports ?? []).map((s) => (
            <span
              key={s.id}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
                s.is_main ? "bg-navy text-white" : "bg-lagoon-light text-navy"
              }`}
            >
              {s.name}
              {s.is_main && <span className="text-xs opacity-60">principal</span>}
              {!s.is_main && (
                <form action={deleteSport}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="opacity-60 hover:opacity-100" aria-label={`Supprimer ${s.name}`}>
                    ✕
                  </button>
                </form>
              )}
            </span>
          ))}
        </div>

        <div className="mt-4 rounded-card bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-ink">Ajouter un sport</h3>
          <form action={addSport} className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-ink/60">
              Nom du sport
              <input
                name="name" required placeholder="ex. Escalade"
                className="mt-1 w-56 rounded-lg border border-ink/15 px-2 py-1.5"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-lagoon px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Ajouter
            </button>
          </form>
          <p className="mt-2 text-xs text-ink/40">
            Les nouveaux sports apparaissent dans l'onglet "Autres sports". Les 5 sports
            principaux du bandeau ne peuvent pas être supprimés ici.
          </p>
        </div>
      </section>

      {/* ---------------- Affectations ---------------- */}
      <section>
        <h2 className="mb-3 font-display text-xl uppercase tracking-tight text-navy">
          Qui pratique quoi
        </h2>

        <div className="space-y-2">
          {(assignments ?? []).length === 0 ? (
            <p className="rounded-card bg-white p-4 text-sm text-ink/50 shadow-sm">
              Aucune affectation pour l'instant.
            </p>
          ) : (
            assignments.map((a) => (
              <form
                key={a.id}
                action={updateAssignment}
                className="grid grid-cols-2 gap-2 rounded-card bg-sand p-3 sm:grid-cols-6 sm:items-end"
              >
                <input type="hidden" name="id" value={a.id} />

                <div className="text-sm sm:col-span-1">
                  <p className="text-xs font-semibold text-ink/40">Participant</p>
                  <p className="font-semibold text-ink">{a.participants?.first_name}</p>
                </div>

                <div className="text-sm sm:col-span-1">
                  <p className="text-xs font-semibold text-ink/40">Sport</p>
                  <p className="font-semibold text-ink">{a.sports?.name}</p>
                </div>

                <label className="text-xs font-semibold text-ink/60">
                  Club
                  <input
                    name="club" defaultValue={a.club ?? ""}
                    className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
                  />
                </label>

                <label className="text-xs font-semibold text-ink/60">
                  Catégorie
                  <input
                    name="category" defaultValue={a.category ?? ""}
                    className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
                  />
                </label>

                <label className="text-xs font-semibold text-ink/60">
                  Lien (calendrier/résultats)
                  <input
                    name="link_url" defaultValue={a.link_url ?? ""}
                    className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1.5"
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-full bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-light"
                  >
                    Enregistrer
                  </button>
                  <button
                    type="submit"
                    formAction={deleteAssignment}
                    className="rounded-full px-3 py-1.5 text-sm font-semibold text-cardinal hover:bg-cardinal-light"
                  >
                    Suppr.
                  </button>
                </div>
              </form>
            ))
          )}
        </div>

        <div className="mt-4 rounded-card bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-ink">Affecter un sport à un participant</h3>
          {(!participants || participants.length === 0 || !sports || sports.length === 0) ? (
            <p className="text-sm text-ink/50">
              Ajoute d'abord au moins un participant et un sport.
            </p>
          ) : (
            <form action={addAssignment} className="grid gap-3 sm:grid-cols-3">
              <select name="participant_id" required className="rounded-lg border border-ink/15 px-3 py-2">
                <option value="">Participant</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>{p.first_name}</option>
                ))}
              </select>

              <select name="sport_id" required className="rounded-lg border border-ink/15 px-3 py-2">
                <option value="">Sport</option>
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <input
                name="category" placeholder="Catégorie (ex. U15)"
                className="rounded-lg border border-ink/15 px-3 py-2"
              />
              <input
                name="club" placeholder="Club"
                className="rounded-lg border border-ink/15 px-3 py-2"
              />
              <input
                name="link_url" placeholder="Lien (calendrier/résultats)"
                className="rounded-lg border border-ink/15 px-3 py-2 sm:col-span-2"
              />

              <button
                type="submit"
                className="rounded-full bg-cardinal px-5 py-2 font-semibold text-white hover:bg-cardinal-dark sm:col-span-3 sm:w-fit"
              >
                Affecter
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
