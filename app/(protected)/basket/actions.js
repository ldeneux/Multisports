"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeCurrentSeasonLabel } from "@/lib/utils";

// Supabase-js ne lève pas d'exception sur une erreur de requête : il faut
// vérifier { error } explicitement, sinon un échec passe inaperçu.
function assertNoError(step, error) {
  if (error) {
    throw new Error(`${step} : ${error.message}`);
  }
}

// ---- Saisie manuelle ------------------------------------------------------
// On alimente team1_name/team2_name/us_is_team1 dès la création pour que le
// match manuel s'affiche exactement comme un match FFBB (MatchCard ne lit
// que ces champs-là, pas team_score_us/team_score_them).

export async function addMatch(formData) {
  const supabase = createClient();

  const homeAway = formData.get("home_away");
  const opponent = formData.get("opponent");
  const usIsTeam1 = homeAway === "domicile";

  const { error } = await supabase.from("basketball_matches").insert({
    participant_sport_id: formData.get("participant_sport_id"),
    match_date: formData.get("match_date"),
    opponent,
    location: formData.get("location") || null,
    home_away: homeAway,
    us_is_team1: usIsTeam1,
    team1_name: usIsTeam1 ? null : opponent,
    team2_name: usIsTeam1 ? opponent : null,
    season: computeCurrentSeasonLabel(),
    status: "a_venir",
    source: "manuel",
  });
  assertNoError("Ajout du match", error);

  revalidatePath("/basket");
}

export async function recordScore(formData) {
  const supabase = createClient();
  const matchId = formData.get("match_id");

  const { data: match, error: readError } = await supabase
    .from("basketball_matches")
    .select("us_is_team1")
    .eq("id", matchId)
    .single();
  if (readError || !match) {
    console.error("recordScore: lecture du match impossible", readError);
    revalidatePath("/basket");
    return;
  }

  const usScore = formData.get("team_score_us") || null;
  const themScore = formData.get("team_score_them") || null;
  const usIsTeam1 = match.us_is_team1;

  const { error } = await supabase
    .from("basketball_matches")
    .update({
      team_score_us: usScore,
      team_score_them: themScore,
      team1_score: usIsTeam1 ? usScore : themScore,
      team2_score: usIsTeam1 ? themScore : usScore,
      status: "joue",
    })
    .eq("id", matchId);
  assertNoError("Enregistrement du score", error);

  revalidatePath("/basket");
}

export async function deleteMatch(formData) {
  const supabase = createClient();
  // On ne supprime jamais un match officiel issu d'une synchro FFBB — il
  // reviendrait de toute façon à la prochaine synchro, et le supprimer
  // casserait la cohérence du calendrier officiel.
  await supabase
    .from("basketball_matches")
    .delete()
    .eq("id", formData.get("match_id"))
    .eq("source", "manuel");
  revalidatePath("/basket");
}

// Supprime UNIQUEMENT les matchs et le classement de la saison EN COURS
// pour ce participant. La saison en cours est recalculée ici, côté serveur
// — jamais lue depuis le formulaire — pour qu'il soit impossible de
// réinitialiser une saison passée par erreur : l'engagement FFBB change
// chaque année, une archive supprimée ne peut plus jamais être
// resynchronisée.
export async function resetCurrentSeason(formData) {
  const supabase = createClient();
  const participantSportId = formData.get("participant_sport_id");
  const currentSeason = computeCurrentSeasonLabel();

  await supabase
    .from("basketball_matches")
    .delete()
    .eq("participant_sport_id", participantSportId)
    .eq("season", currentSeason);

  await supabase
    .from("basketball_classements")
    .delete()
    .eq("participant_sport_id", participantSportId)
    .eq("season", currentSeason);

  revalidatePath("/basket");
}

// ---- ID FFBB manuel --------------------------------------------------------

export async function updateFfbbId(formData) {
  const supabase = createClient();

  const { error } = await supabase
    .from("participant_sports")
    .update({ ffbb_engagement_id: formData.get("ffbb_engagement_id") || null })
    .eq("id", formData.get("participant_sport_id"));
  assertNoError("Enregistrement de l'ID FFBB", error);

  revalidatePath("/basket");
}

// ---- Synchronisation FFBB (expérimentale, API non officielle) -------------

function extractEngagementIdFromUrl(url) {
  if (!url) return null;
  // ex: https://competitions.ffbb.com/.../equipes/200000005251991
  const match = url.match(/equipes\/(\d+)/);
  return match ? match[1] : null;
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

  const season = computeCurrentSeasonLabel();

  try {
    // Import dynamique : si le package n'est pas installé ou que l'API a
    // changé, on tombe proprement dans le catch plutôt que de casser la page.
    const { FFBBClient } = await import("ffbb-api-client");
    const client = new FFBBClient();
    await client.authenticate();

    const engagement = await client.getEngagement(engagementId, {
      fields: ["id", "nom", "idPoule.id", "idCompetition.nom"],
    });

    if (!engagement?.idPoule?.id) {
      throw new Error(
        "Poule introuvable pour cet ID FFBB. Vérifie l'ID engagement (visible dans l'URL de l'équipe sur competitions.ffbb.com)."
      );
    }

    const pouleId = String(engagement.idPoule.id);
    const divisionLabel = engagement.idCompetition?.nom || null;

    const poule = await client.getPoule(engagement.idPoule.id, {
      fields: [
        "id",
        "rencontres.id",
        "rencontres.numero",
        "rencontres.numeroJournee",
        "rencontres.date_rencontre",
        "rencontres.joue",
        "rencontres.resultatEquipe1",
        "rencontres.resultatEquipe2",
        "rencontres.nomEquipe1",
        "rencontres.nomEquipe2",
        "rencontres.idEngagementEquipe1.id",
        "rencontres.idEngagementEquipe2.id",
        "rencontres.idOrganismeEquipe1.logo.id",
        "rencontres.idOrganismeEquipe2.logo.id",
        "rencontres.salle.libelle",
        "rencontres.salle.commune.libelle",
        "classements.id",
        "classements.idEngagement.id",
        "classements.idEngagement.nom",
        "classements.matchJoues",
        "classements.points",
        "classements.position",
        "classements.gagnes",
        "classements.perdus",
      ],
      deep: {
        rencontres: { _limit: 500, _sort: ["date_rencontre"] },
      },
    });

    // On garde TOUS les matchs de la poule (pas seulement les nôtres) pour
    // pouvoir afficher "Toute la poule" — us_is_team1 reste null pour les
    // matchs qui ne nous concernent pas.
    const rencontres = poule?.rencontres ?? [];

    const matchPayload = rencontres.map((r) => {
      const isTeam1 = String(r.idEngagementEquipe1?.id) === String(engagementId);
      const isTeam2 = String(r.idEngagementEquipe2?.id) === String(engagementId);
      const usIsTeam1 = isTeam1 ? true : isTeam2 ? false : null;
      const location = [r.salle?.libelle, r.salle?.commune?.libelle].filter(Boolean).join(", ");

      // Champs "opponent"/"home_away"/"team_score_us/them" conservés pour
      // compatibilité (saisie manuelle, anciens écrans) mais l'affichage
      // actuel se base sur team1_*/team2_*/us_is_team1.
      const opponent =
        usIsTeam1 === true ? r.nomEquipe2 : usIsTeam1 === false ? r.nomEquipe1 : null;
      const usScore = usIsTeam1 === true ? r.resultatEquipe1 : usIsTeam1 === false ? r.resultatEquipe2 : null;
      const themScore = usIsTeam1 === true ? r.resultatEquipe2 : usIsTeam1 === false ? r.resultatEquipe1 : null;

      return {
        participant_sport_id: participantSportId,
        ffbb_rencontre_id: String(r.id),
        poule_id: pouleId,
        season,
        division_label: divisionLabel,
        numero_journee: r.numeroJournee != null ? String(r.numeroJournee) : null,
        match_date: r.date_rencontre,
        opponent: opponent || (r.nomEquipe1 && r.nomEquipe2 ? `${r.nomEquipe1} vs ${r.nomEquipe2}` : "Adversaire inconnu"),
        home_away: usIsTeam1 === true ? "domicile" : usIsTeam1 === false ? "exterieur" : null,
        team_score_us: usScore ?? null,
        team_score_them: themScore ?? null,
        us_is_team1: usIsTeam1,
        team1_name: r.nomEquipe1 || null,
        team1_score: r.resultatEquipe1 ?? null,
        team1_logo_asset: r.idOrganismeEquipe1?.logo?.id || null,
        team1_engagement_id: r.idEngagementEquipe1?.id ? String(r.idEngagementEquipe1.id) : null,
        team2_name: r.nomEquipe2 || null,
        team2_score: r.resultatEquipe2 ?? null,
        team2_logo_asset: r.idOrganismeEquipe2?.logo?.id || null,
        team2_engagement_id: r.idEngagementEquipe2?.id ? String(r.idEngagementEquipe2.id) : null,
        location: location || null,
        status: r.joue ? "joue" : "a_venir",
        source: "ffbb",
      };
    });

    if (matchPayload.length > 0) {
      const { error: writeError } = await supabase
        .from("basketball_matches")
        .upsert(matchPayload, { onConflict: "participant_sport_id,ffbb_rencontre_id" });
      if (writeError) {
        throw new Error(`Écriture des matchs impossible (${writeError.message}).`);
      }
    }

    // Classement de la poule — annule et remplace pour cette saison.
    const classements = poule?.classements ?? [];
    const { error: delError } = await supabase
      .from("basketball_classements")
      .delete()
      .eq("participant_sport_id", participantSportId)
      .eq("season", season);
    assertNoError("Nettoyage de l'ancien classement", delError);

    if (classements.length > 0) {
      const standingsPayload = classements
        .filter((c) => c.idEngagement?.id)
        .map((c) => ({
          participant_sport_id: participantSportId,
          poule_id: pouleId,
          season,
          engagement_id: String(c.idEngagement.id),
          engagement_nom: c.idEngagement.nom || "Équipe inconnue",
          position: c.position ?? null,
          points: c.points ?? null,
          matches_joues: c.matchJoues ?? null,
          gagnes: c.gagnes ?? null,
          perdus: c.perdus ?? null,
          is_us: String(c.idEngagement.id) === String(engagementId),
          synced_at: new Date().toISOString(),
        }));

      if (standingsPayload.length > 0) {
        const { error: standingsError } = await supabase
          .from("basketball_classements")
          .insert(standingsPayload);
        if (standingsError) {
          throw new Error(`Écriture du classement impossible (${standingsError.message}).`);
        }
      }
    }

    const ourMatchesCount = matchPayload.filter((m) => m.us_is_team1 !== null).length;

    const { error: okError } = await supabase
      .from("participant_sports")
      .update({
        ffbb_engagement_id: engagementId,
        last_ffbb_sync_at: new Date().toISOString(),
        last_ffbb_sync_error:
          ourMatchesCount === 0
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
