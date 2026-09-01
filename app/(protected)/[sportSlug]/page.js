import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculateAge, MAIN_SPORT_SLUGS } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SportPage({ params }) {
  const { sportSlug } = params;
  const supabase = createClient();

  const isOthers = sportSlug === "autres-sports";

  if (!isOthers && !MAIN_SPORT_SLUGS.includes(sportSlug)) {
    notFound();
  }

  let sportsInScope = [];
  if (isOthers) {
    const { data } = await supabase
      .from("sports")
      .select("*")
      .eq("is_main", false)
      .order("name");
    sportsInScope = data ?? [];
  } else {
    const { data } = await supabase
      .from("sports")
      .select("*")
      .eq("slug", sportSlug)
      .maybeSingle();
    if (!data) notFound();
    sportsInScope = [data];
  }

  const sportIds = sportsInScope.map((s) => s.id);

  const { data: assignments } = sportIds.length
    ? await supabase
        .from("participant_sports")
        .select("*, participants(id, first_name, birthdate), sports(name, slug)")
        .in("sport_id", sportIds)
    : { data: [] };

  const pageTitle = isOthers ? "Autres sports" : sportsInScope[0].name;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
          {pageTitle}
        </h1>
        <p className="mt-1 text-ink/60">
          {isOthers
            ? "Tous les sports pratiqués en dehors des 5 sports principaux."
            : "Participants suivis dans ce sport."}
        </p>
      </div>

      {(!assignments || assignments.length === 0) ? (
        <div className="rounded-card bg-white p-8 text-center shadow-sm">
          <p className="mb-4 text-ink/60">
            Personne n'est encore associé à {isOthers ? "un sport de cette catégorie" : "ce sport"}.
          </p>
          <Link
            href="/parametres"
            className="inline-block rounded-full bg-navy px-5 py-2 font-semibold text-white hover:bg-navy-light"
          >
            Configurer dans Paramètres
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {assignments.map((a) => (
            <div key={a.id} className="rounded-card bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg uppercase tracking-tight text-navy">
                  {a.participants?.first_name}
                </p>
                {a.participants?.birthdate && (
                  <span className="text-sm text-ink/50">
                    {calculateAge(a.participants.birthdate)} ans
                  </span>
                )}
              </div>
              {isOthers && (
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-lagoon">
                  {a.sports?.name}
                </p>
              )}
              <div className="mt-2 space-y-1 text-sm text-ink/60">
                {a.club && <p>Club : {a.club}</p>}
                {a.category && <p>Catégorie : {a.category}</p>}
              </div>
              {a.link_url && (
                <a
                  href={a.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm font-semibold text-cardinal hover:underline"
                >
                  Voir les calendriers / résultats officiels →
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-ink/40">
        Le suivi des matchs, courses et statistiques arrivera dans une prochaine étape.
      </p>
    </div>
  );
}
