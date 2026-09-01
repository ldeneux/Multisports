import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createClient();

  const { data: participants } = await supabase
    .from("participants")
    .select("*, participant_sports(club, category, sports(name, slug))")
    .order("birthdate");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
          Bonjour !
        </h1>
        <p className="mt-1 text-ink/60">
          Vue d'ensemble des participants et de leurs sports.
        </p>
      </div>

      {(!participants || participants.length === 0) ? (
        <div className="rounded-card bg-white p-8 text-center shadow-sm">
          <p className="mb-4 text-ink/60">
            Aucun participant configuré pour l'instant.
          </p>
          <Link
            href="/parametres"
            className="inline-block rounded-full bg-navy px-5 py-2 font-semibold text-white hover:bg-navy-light"
          >
            Aller dans Paramètres
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {participants.map((p) => (
            <div key={p.id} className="rounded-card bg-white p-5 shadow-sm">
              <p className="font-display text-xl uppercase tracking-tight text-navy">
                {p.first_name}
              </p>
              {p.birthdate && (
                <p className="text-sm text-ink/50">{calculateAge(p.birthdate)} ans</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(p.participant_sports ?? []).length === 0 && (
                  <span className="text-xs text-ink/40">Aucun sport assigné</span>
                )}
                {(p.participant_sports ?? []).map((ps, i) => (
                  <Link
                    key={i}
                    href={`/${ps.sports?.slug}`}
                    className="rounded-full bg-lagoon-light px-2.5 py-1 text-xs font-semibold text-navy hover:bg-lagoon hover:text-white"
                  >
                    {ps.sports?.name}
                    {ps.category ? ` · ${ps.category}` : ""}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <Link
          href="/parametres"
          className="text-sm font-semibold text-navy hover:underline"
        >
          Gérer les participants, sports et affectations →
        </Link>
      </div>
    </div>
  );
}
