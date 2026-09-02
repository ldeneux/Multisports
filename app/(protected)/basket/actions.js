"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---- Saisie manuelle ------------------------------------------------------

export async function addMatch(formData) {
  const supabase = createClient();

  await supabase.from("basketball_matches").insert({
    participant_sport_id: formData.get("participant_sport_id"),
    match_date: formData.get("match_date"),
    opponent: formData.get("opponent"),
    location: formData.get("location") || null,
    home_away: formData.get("home_away"),
    status: "a_venir",
    source: "manuel",
  });

  revalidatePath("/basket");
}

export async function recordScore(formData) {
  const supabase = createClient();

  await supabase
    .from("basketball_matches")
    .update({
      team_score_us: formData.get("team_score_us") || null,
      team_score_them: formData.get("team_score_them") || null,
      status: "joue",
    })
    .eq("id", formData.get("match_id"));

  revalidatePath("/basket");
}

export async function deleteMatch(formData) {
  const supabase = createClient();
  await supabase.from("basketball_matches").delete().eq("id", formData.get("match_id"));
  revalidatePath("/basket");
}

// ---- ID FFBB manuel --------------------------------------------------------

export async function updateFfbbId(formData) {
  const supabase = createClient();

  await supabase
    .from("participant_sports")
    .update({ ffbb_engagement_id: formData.get("ffbb_engagement_id") || null })
    .eq("id", formData.get("participant_sport_id"));

  revalidatePath("/basket");
}

// ---- Synchronisation FFBB (expérimentale, API non officielle) -------------

function extractEngagementIdFromUrl(url) {
  if (!url) return null;
  // ex: https://competitions.ffbb.com/.../equipes/200000005251991
  const match = url.match(/equipes\/(\d+)/);
  return match ? match[1] : null;
}

// Petit garde-fou : Supabase-js NE lève PAS d'exception sur une erreur de
// requête (RLS, colonne manquante...), il renvoie juste { error }. Sans ce
// check, une synchro peut "réussir" silencieusement sans rien écrire.
function assertNoError(step, error) {
  if (error) {
    throw new Error(`${step} : ${error.message}`);
  }
}

export async function syncFfbbMatches(formData) {
  const supabase = createClient();
  const participantSportId = formData.get("participant_sport_id");

  const { data: ps, error: readError } = await supabase
    .from("participant_sports")
    .select("*")
    .eq("id", participantSportId)
    .single();

  if (readError || !ps) {
    console.error("syncFfbbMatches: lecture participant_sports impossible", readError);
    revalidatePath("/basket");
    return;
  }

  const engagementId = ps.ffbb_engagement_id || extractEngagementIdFromUrl(ps.link_url);

  if (!engagementId) {
    await supabase
      .from("participant_sports")
      .update({
        last_ffbb_sync_at: new Date().toISOString(),
        last_ffbb_sync_error:
          "Aucun ID FFBB trouvé automatiquement. Renseigne l'ID engagement manuellement ci-dessous.",
      })
      .eq("id", participantSportId);
    revalidatePath("/basket");
    return;
  }

  try {
    // Import dynamique : si le package n'est pas installé ou que l'API a
    // changé, on tombe proprement dans le catch plutôt que de casser la page.
    const { FFBBClient } = await import("ffbb-api-client");
    const client = new FFBBClient();
    await client.authenticate();

    const engagement = await client.getEngagement(engagementId, {
      fields: ["id", "nom", "idPoule.id"],
    });

    if (!engagement?.idPoule?.id) {
      throw new Error(
        "Poule introuvable pour cet ID FFBB. Vérifie l'ID engagement (visible dans l'URL de l'équipe sur competitions.ffbb.com)."
      );
    }

    const poule = await client.getPoule(engagement.idPoule.id, {
      fields: [
        "id",
        "rencontres.id",
        "rencontres.date_rencontre",
        "rencontres.joue",
        "rencontres.resultatEquipe1",
        "rencontres.resultatEquipe2",
        "rencontres.nomEquipe1",
        "rencontres.nomEquipe2",
        "rencontres.idEngagementEquipe1.id",
        "rencontres.idEngagementEquipe2.id",
        "rencontres.salle.libelle",
        "rencontres.salle.commune.libelle",
      ],
      deep: {
        rencontres: { _limit: 200, _sort: ["date_rencontre"] },
      },
    });

    const rencontres = poule?.rencontres ?? [];
    const ourMatches = rencontres.filter(
      (r) =>
        String(r.idEngagementEquipe1?.id) === String(engagementId) ||
        String(r.idEngagementEquipe2?.id) === String(engagementId)
    );

    for (const r of ourMatches) {
      const isHome = String(r.idEngagementEquipe1?.id) === String(engagementId);
      const opponent = (isHome ? r.nomEquipe2 : r.nomEquipe1) || "Adversaire inconnu";
      const usScore = isHome ? r.resultatEquipe1 : r.resultatEquipe2;
      const themScore = isHome ? r.resultatEquipe2 : r.resultatEquipe1;
      const location = [r.salle?.libelle, r.salle?.commune?.libelle]
        .filter(Boolean)
        .join(", ");

      const { error: writeError } = await supabase.from("basketball_matches").upsert(
        {
          participant_sport_id: participantSportId,
          ffbb_rencontre_id: String(r.id),
          match_date: r.date_rencontre,
          opponent,
          location: location || null,
          home_away: isHome ? "domicile" : "exterieur",
          team_score_us: usScore ?? null,
          team_score_them: themScore ?? null,
          status: r.joue ? "joue" : "a_venir",
          source: "ffbb",
        },
        { onConflict: "participant_sport_id,ffbb_rencontre_id" }
      );
      if (writeError) {
        throw new Error(`Écriture en base impossible (${writeError.message}). As-tu bien joué le script 4-basketball-sync.sql ?`);
      }
    }

    const { error: okError } = await supabase
      .from("participant_sports")
      .update({
        ffbb_engagement_id: engagementId,
        last_ffbb_sync_at: new Date().toISOString(),
        last_ffbb_sync_error:
          ourMatches.length === 0
            ? "Synchro OK mais aucun match trouvé pour cet ID — vérifie qu'il s'agit bien du bon engagement."
            : null,
      })
      .eq("id", participantSportId);
    assertNoError("Mise à jour du statut de synchro", okError);
  } catch (err) {
    await supabase
      .from("participant_sports")
      .update({
        last_ffbb_sync_at: new Date().toISOString(),
        last_ffbb_sync_error: String(err?.message || err).slice(0, 300),
      })
      .eq("id", participantSportId);
  }

  revalidatePath("/basket");
}
