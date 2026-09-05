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

function extractEngagementIdFromUrl(url) {
  if (!url) return null;
  // ex: https://competitions.ffbb.com/.../equipes/200000005251991
  const match = url.match(/equipes\/(\d+)/);
  return match ? match[1] : null;
}

// ---- Phases de saison ------------------------------------------------------
// Une "phase" = une compétition FFBB distincte au sein d'une même saison
// (ex. "Saison régulière" puis "Phase 2" puis "Phase 3" pour les U15F) —
// chacune a son propre ID FFBB (engagement) et sa propre poule. On les gère
// toujours pour la SAISON EN COURS uniquement (comme la synchro elle-même) ;
// les saisons archivées gardent leurs phases telles quelles, en lecture
// seule, pour toujours.

export async function addPhase(formData) {
  const supabase = createClient();
  const participantSportId = formData.get("participant_sport_id");
  const season = computeCurrentSeasonLabel();

  const { data: existing } = await supabase
    .from("basketball_phases")
    .select("position, ffbb_engagement_id")
    .eq("participant_sport_id", participantSportId)
    .eq("season", season)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;
  let engagementId = formData.get("ffbb_engagement_id") || null;

  // Pour la toute première phase d'un participant, si aucun ID n'est saisi,
  // on tente de le retrouver depuis le lien FFBB déjà renseigné dans
  // Paramètres (comme le faisait l'ancienne synchro globale).
  if (!engagementId && nextPosition === 1) {
    const { data: ps } = await supabase
      .from("participant_sports")
      .select("link_url")
      .eq("id", participantSportId)
      .maybeSingle();
    engagementId = extractEngagementIdFromUrl(ps?.link_url);
  }

  const { error } = await supabase.from("basketball_phases").insert({
    participant_sport_id: participantSportId,
    season,
    phase_name: formData.get("phase_name") || `Phase ${nextPosition}`,
    ffbb_engagement_id: engagementId,
    competition_url: formData.get("competition_url") || null,
    position: nextPosition,
  });
  assertNoError("Ajout de la phase", error);

  revalidatePath("/basket");
}

export async function updatePhase(formData) {
  const supabase = createClient();

  const { error } = await supabase
    .from("basketball_phases")
    .update({
      phase_name: formData.get("phase_name") || "Phase",
      ffbb_engagement_id: formData.get("ffbb_engagement_id") || null,
      competition_url: formData.get("competition_url") || null,
    })
    .eq("id", formData.get("phase_id"));
  assertNoError("Mise à jour de la phase", error);

  revalidatePath("/basket");
}

export async function deletePhase(formData) {
  const supabase = createClient();
  // Cascade : supprime aussi les matchs et le classement de cette phase
  // (basketball_matches.phase_id / basketball_classements.phase_id sont en
  // "on delete cascade").
  await supabase.from("basketball_phases").delete().eq("id", formData.get("phase_id"));
  revalidatePath("/basket");
}

// ---- Saisie manuelle --------------------------------------------------------
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
    phase_id: formData.get("phase_id") || null,
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

// Supprime UNIQUEMENT les phases (et, par cascade, leurs matchs et
// classements) de la saison EN COURS pour ce participant. La saison en
// cours est recalculée ici, côté serveur — jamais lue depuis le formulaire
// — pour qu'il soit impossible de réinitialiser une saison passée par
// erreur : l'engagement FFBB change chaque année, une archive supprimée ne
// peut plus jamais être resynchronisée.
export async function resetCurrentSeason(formData) {
  const supabase = createClient();
  const participantSportId = formData.get("participant_sport_id");
  const currentSeason = computeCurrentSeasonLabel();

  // Filet de sécurité en plus de la cascade (au cas où d'anciennes lignes
  // n'auraient pas encore de phase_id renseigné).
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

  await supabase
    .from("basketball_phases")
    .delete()
    .eq("participant_sport_id", participantSportId)
    .eq("season", currentSeason);

  revalidatePath("/basket");
}

// ---- Synchronisation FFBB (expérimentale, API non officielle) -------------
// Une synchro cible toujours UNE phase précise (donc un ID FFBB précis) —
// c'est ce qui permet d'avoir plusieurs compétitions actives dans la même
// saison (Saison régulière / Phase 2 / Phase 3...).

export async function syncPhase(formData) {
  const supabase = createClient();
  const phaseId = formData.get("phase_id");

  const { data: phase, error: readError } = await supabase
    .from("basketball_phases")
    .select("*")
    .eq("id", phaseId)
    .single();

  if (readError || !phase) {
    console.error("syncPhase: lecture de la phase impossible", readError);
    revalidatePath("/basket");
    return;
  }

  const engagementId = phase.ffbb_engagement_id;
  const participantSportId = phase.participant_sport_id;
  const season = phase.season;

  if (!engagementId) {
    await supabase
      .from("basketball_phases")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: "Aucun ID FFBB renseigné pour cette phase — ajoute-le dans « Gérer les phases ».",
      })
      .eq("id", phaseId);
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
      fields: ["id", "nom", "idPoule.id", "idPoule.nom", "idCompetition.nom"],
    });

    if (!engagement?.idPoule?.id) {
      throw new Error(
        "Poule introuvable pour cet ID FFBB. Vérifie l'ID engagement (visible dans l'URL de l'équipe sur competitions.ffbb.com)."
      );
    }

    const pouleId = String(engagement.idPoule.id);
    const competitionName = engagement.idCompetition?.nom || null;
    const pouleLabel = engagement.idPoule?.nom || null;

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
        phase_id: phaseId,
        ffbb_rencontre_id: String(r.id),
        poule_id: pouleId,
        season,
        division_label: competitionName,
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

    // Classement de la poule — annule et remplace pour CETTE PHASE
    // uniquement (une autre phase de la même saison a son propre
    // classement, à ne pas toucher).
    const classements = poule?.classements ?? [];
    const { error: delError } = await supabase
      .from("basketball_classements")
      .delete()
      .eq("phase_id", phaseId);
    assertNoError("Nettoyage de l'ancien classement", delError);

    if (classements.length > 0) {
      const standingsPayload = classements
        .filter((c) => c.idEngagement?.id)
        .map((c) => ({
          participant_sport_id: participantSportId,
          phase_id: phaseId,
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
      .from("basketball_phases")
      .update({
        ffbb_engagement_id: engagementId,
        poule_id: pouleId,
        competition_name: competitionName,
        poule_label: pouleLabel,
        last_sync_at: new Date().toISOString(),
        last_sync_error:
          ourMatchesCount === 0
            ? "Synchro OK mais aucun match trouvé pour cet ID — vérifie qu'il s'agit bien du bon engagement."
            : null,
      })
      .eq("id", phaseId);
    assertNoError("Mise à jour du statut de synchro", okError);
  } catch (err) {
    await supabase
      .from("basketball_phases")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: String(err?.message || err).slice(0, 300),
      })
      .eq("id", phaseId);
  }

  revalidatePath("/basket");
}
