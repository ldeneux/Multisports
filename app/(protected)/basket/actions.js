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
  const phaseType = formData.get("phase_type") === "amical" ? "amical" : "ffbb";

  const { data: existing } = await supabase
    .from("basketball_phases")
    .select("position, ffbb_engagement_id")
    .eq("participant_sport_id", participantSportId)
    .eq("season", season)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;
  let engagementId = phaseType === "amical" ? null : formData.get("ffbb_engagement_id") || null;

  // Pour la toute première phase d'un participant, si aucun ID n'est saisi,
  // on tente de le retrouver depuis le lien FFBB déjà renseigné dans
  // Paramètres (comme le faisait l'ancienne synchro globale). Non applicable
  // à une phase amicale, qui n'a jamais d'ID FFBB.
  if (phaseType === "ffbb" && !engagementId && nextPosition === 1) {
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
    phase_type: phaseType,
    phase_name: formData.get("phase_name") || (phaseType === "amical" ? "Matchs amicaux" : `Phase ${nextPosition}`),
    ffbb_engagement_id: engagementId,
    competition_url: phaseType === "amical" ? null : formData.get("competition_url") || null,
    position: nextPosition,
  });
  assertNoError("Ajout de la phase", error);

  revalidatePath("/basket");
}

export async function updatePhase(formData) {
  const supabase = createClient();
  const phaseId = formData.get("phase_id");

  // On relit le type existant plutôt que de faire confiance au formulaire :
  // une phase amicale ne doit jamais se voir attribuer un ID FFBB, même par
  // erreur (un champ cachait resterait vide de toute façon côté UI, mais on
  // se protège aussi côté serveur).
  const { data: existingPhase } = await supabase
    .from("basketball_phases")
    .select("phase_type")
    .eq("id", phaseId)
    .maybeSingle();
  const isAmical = existingPhase?.phase_type === "amical";

  const { error } = await supabase
    .from("basketball_phases")
    .update({
      phase_name: formData.get("phase_name") || "Phase",
      ffbb_engagement_id: isAmical ? null : formData.get("ffbb_engagement_id") || null,
      competition_url: isAmical ? null : formData.get("competition_url") || null,
    })
    .eq("id", phaseId);
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

  const participantSportId = formData.get("participant_sport_id");
  const homeAway = formData.get("home_away");
  const opponent = formData.get("opponent");
  const usIsTeam1 = homeAway === "domicile";

  // MatchCard n'effectue plus aucune substitution de nom à l'affichage — on
  // enregistre donc le vrai nom du club directement dans team1_name/
  // team2_name, comme le ferait une synchro FFBB.
  const { data: ps } = await supabase
    .from("participant_sports")
    .select("club")
    .eq("id", participantSportId)
    .maybeSingle();
  const clubName = ps?.club || "Nous";

  const { error } = await supabase.from("basketball_matches").insert({
    participant_sport_id: participantSportId,
    phase_id: formData.get("phase_id") || null,
    match_date: formData.get("match_date"),
    opponent,
    location: formData.get("location") || null,
    home_away: homeAway,
    us_is_team1: usIsTeam1,
    team1_name: usIsTeam1 ? clubName : opponent,
    team2_name: usIsTeam1 ? opponent : clubName,
    season: computeCurrentSeasonLabel(),
    status: "a_venir",
    source: "manuel",
  });
  assertNoError("Ajout du match", error);

  revalidatePath("/basket");
}

// Feuille de match complète : ouverte en cliquant sur la date (match à venir)
// ou le score (match joué) depuis le calendrier — jamais de saisie en ligne
// sur la carte du match elle-même.

// Score par quart-temps + notes. Pour un match FFBB, le score officiel
// (team1_score/team2_score) n'est JAMAIS modifié ici — seuls les quarts-temps
// et les notes sont enregistrés, à titre indicatif. Pour un match manuel
// (typiquement amical), le score total est recalculé à partir des
// quarts-temps saisis, et le statut joué/à venir peut être basculé.
export async function saveMatchSheet(formData) {
  const supabase = createClient();
  const matchId = formData.get("match_id");

  const { data: match, error: readError } = await supabase
    .from("basketball_matches")
    .select("us_is_team1, source")
    .eq("id", matchId)
    .single();
  if (readError || !match) {
    console.error("saveMatchSheet: lecture du match impossible", readError);
    revalidatePath("/basket");
    return;
  }

  const quarters = [1, 2, 3, 4].map((q) => {
    const us = formData.get(`q${q}_us`);
    const them = formData.get(`q${q}_them`);
    return {
      us: us !== null && us !== "" ? Number(us) : null,
      them: them !== null && them !== "" ? Number(them) : null,
    };
  });
  const hasAnyQuarter = quarters.some((q) => q.us != null || q.them != null);
  const notes = formData.get("notes") || null;

  const update = {
    match_report: hasAnyQuarter || notes ? { quarters: hasAnyQuarter ? quarters : null, notes } : null,
  };

  if (match.source === "manuel") {
    const played = formData.get("played") === "on";
    if (hasAnyQuarter) {
      const totalUs = quarters.reduce((sum, q) => sum + (q.us ?? 0), 0);
      const totalThem = quarters.reduce((sum, q) => sum + (q.them ?? 0), 0);
      update.team1_score = match.us_is_team1 ? totalUs : totalThem;
      update.team2_score = match.us_is_team1 ? totalThem : totalUs;
    }
    update.status = played || hasAnyQuarter ? "joue" : "a_venir";
  }

  const { error } = await supabase.from("basketball_matches").update(update).eq("id", matchId);
  assertNoError("Enregistrement de la feuille de match", error);

  revalidatePath("/basket");
}

// Effectif de l'équipe — persistant, réutilisable d'un match à l'autre (et
// d'une saison à l'autre : la liste est rattachée au participant, pas à une
// phase ou une saison précise). Fiche façon FFBB (e-marque) : les champs
// "joueur" (n° de maillot, surclassement, capitaine habituel) et
// "entraîneur" (diplôme, adjoint) sont tous les deux acceptés dans le même
// formulaire, seuls ceux du rôle choisi sont conservés.
export async function addPlayer(formData) {
  const supabase = createClient();
  const lastName = formData.get("last_name");
  const firstName = formData.get("first_name");
  if (!lastName && !firstName) {
    revalidatePath("/basket");
    return;
  }

  const role = formData.get("role") === "entraineur" ? "entraineur" : "joueur";
  const name = [lastName, firstName].filter(Boolean).join(" ") || "Sans nom";

  const { error } = await supabase.from("basketball_players").insert({
    participant_sport_id: formData.get("participant_sport_id"),
    role,
    name,
    last_name: lastName || null,
    first_name: firstName || null,
    club: formData.get("club") || null,
    licence_number: formData.get("licence_number") || null,
    national_number: formData.get("national_number") || null,
    licence_type: formData.get("licence_type") || null,
    licence_not_presented: formData.get("licence_not_presented") === "on",
    // Champs propres au rôle "joueur" — ignorés (mis à vide) pour un
    // entraîneur, même s'ils ont été soumis par erreur.
    jersey_number:
      role === "joueur" && formData.get("jersey_number") !== "" ? Number(formData.get("jersey_number")) : null,
    surclassement: role === "joueur" ? formData.get("surclassement") || null : null,
    is_default_captain: role === "joueur" && formData.get("is_default_captain") === "on",
    // Champs propres au rôle "entraîneur" :
    diplome: role === "entraineur" ? formData.get("diplome") || null : null,
    is_adjoint: role === "entraineur" && formData.get("is_adjoint") === "on",
  });
  assertNoError("Ajout de la fiche", error);

  revalidatePath("/basket");
}

export async function deletePlayer(formData) {
  const supabase = createClient();
  // Cascade : supprime aussi ses statistiques enregistrées sur tous les
  // matchs (basketball_match_stats.player_id est en "on delete cascade").
  await supabase.from("basketball_players").delete().eq("id", formData.get("player_id"));
  revalidatePath("/basket");
}

// Statistiques par joueuse pour un match donné — un seul formulaire pour
// tout l'effectif, en "upsert" (crée ou met à jour la ligne de chaque
// joueuse dont le formulaire contient au moins un champ modifié).
export async function saveMatchStats(formData) {
  const supabase = createClient();
  const matchId = formData.get("match_id");
  const playerIds = formData.getAll("player_id");

  if (playerIds.length === 0) {
    revalidatePath("/basket");
    return;
  }

  const numberOr0 = (v) => (v !== null && v !== "" ? Number(v) : 0);

  const rows = playerIds.map((playerId) => ({
    match_id: matchId,
    player_id: playerId,
    fouls: numberOr0(formData.get(`fouls_${playerId}`)),
    ft_made: numberOr0(formData.get(`ft_made_${playerId}`)),
    ft_att: numberOr0(formData.get(`ft_att_${playerId}`)),
    two_made: numberOr0(formData.get(`two_made_${playerId}`)),
    two_att: numberOr0(formData.get(`two_att_${playerId}`)),
    three_made: numberOr0(formData.get(`three_made_${playerId}`)),
    three_att: numberOr0(formData.get(`three_att_${playerId}`)),
    is_captain: formData.get(`captain_${playerId}`) === "on",
    is_starting_five: formData.get(`starting_${playerId}`) === "on",
    minutes_played: formData.get(`minutes_${playerId}`) || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("basketball_match_stats")
    .upsert(rows, { onConflict: "match_id,player_id" });
  assertNoError("Enregistrement des statistiques", error);

  revalidatePath("/basket");
}

// Absence ponctuelle : retire une joueuse de LA feuille de CE match sans la
// supprimer de l'effectif ni toucher ses stats sur les autres matchs.
// Symétrique : on_sheet=true réintègre une joueuse précédemment absente.
export async function togglePlayerOnSheet(formData) {
  const supabase = createClient();
  const matchId = formData.get("match_id");
  const playerId = formData.get("player_id");
  const onSheet = formData.get("on_sheet") === "true";

  const { error } = await supabase.from("basketball_match_stats").upsert(
    { match_id: matchId, player_id: playerId, on_sheet: onSheet, updated_at: new Date().toISOString() },
    { onConflict: "match_id,player_id" }
  );
  assertNoError("Mise à jour de la feuille de match", error);

  revalidatePath("/basket");
}

// Repart de zéro pour CE match uniquement (jamais l'effectif, jamais les
// autres matchs) : quarts-temps, notes, statistiques par joueuse effacés.
// Pour un match manuel, le score et le statut joué/à venir sont aussi
// réinitialisés (ils étaient déduits des quarts-temps) ; pour un match FFBB,
// le score officiel reste inchangé — seule la saisie personnelle est vidée.
export async function resetMatchSheet(formData) {
  const supabase = createClient();
  const matchId = formData.get("match_id");

  const { data: match } = await supabase
    .from("basketball_matches")
    .select("source")
    .eq("id", matchId)
    .maybeSingle();

  await supabase.from("basketball_match_stats").delete().eq("match_id", matchId);

  const update = { match_report: null };
  if (match?.source === "manuel") {
    update.team1_score = null;
    update.team2_score = null;
    update.status = "a_venir";
  }

  const { error } = await supabase.from("basketball_matches").update(update).eq("id", matchId);
  assertNoError("Réinitialisation de la feuille de match", error);

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

// Supprime UNIQUEMENT les phases FFBB (et, par cascade, leurs matchs et
// classements) de la saison EN COURS pour ce participant. Les phases de
// type "amical" ne sont JAMAIS concernées par ce bouton — pour supprimer un
// match amical, il faut le faire directement sur sa ligne dans le
// calendrier. La saison en cours est recalculée ici, côté serveur — jamais
// lue depuis le formulaire — pour qu'il soit impossible de réinitialiser
// une saison passée par erreur : l'engagement FFBB change chaque année, une
// archive supprimée ne peut plus jamais être resynchronisée.
export async function resetCurrentSeason(formData) {
  const supabase = createClient();
  const participantSportId = formData.get("participant_sport_id");
  const currentSeason = computeCurrentSeasonLabel();

  const { data: ffbbPhases } = await supabase
    .from("basketball_phases")
    .select("id")
    .eq("participant_sport_id", participantSportId)
    .eq("season", currentSeason)
    .neq("phase_type", "amical");

  const phaseIds = (ffbbPhases ?? []).map((p) => p.id);
  if (phaseIds.length === 0) {
    revalidatePath("/basket");
    return;
  }

  // On cible explicitement les phases FFBB (via leur phase_id) plutôt que
  // "toute la saison" — c'est ce qui garantit qu'un match amical (rattaché à
  // la phase "amical", jamais incluse dans phaseIds) ne peut jamais être
  // supprimé par ce bouton, même en filet de sécurité.
  await supabase.from("basketball_matches").delete().in("phase_id", phaseIds);
  await supabase.from("basketball_classements").delete().in("phase_id", phaseIds);
  await supabase.from("basketball_phases").delete().in("id", phaseIds);

  revalidatePath("/basket");
}

// Comparaison tolérante (casse, accents, ponctuation) pour repérer si l'ID
// FFBB renseigné correspond bien au club attendu — ex. détecter qu'un ID
// copié par erreur pointe vers l'équipe adverse plutôt que la nôtre.
function normalizeClubName(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
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

  if (phase.phase_type === "amical") {
    // Ne devrait jamais être appelé (le bouton Synchroniser n'existe pas
    // pour une phase amicale côté UI) — garde-fou si jamais l'action est
    // déclenchée directement.
    await supabase
      .from("basketball_phases")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: "Une phase « amicale » ne se synchronise pas — les matchs se saisissent à la main.",
      })
      .eq("id", phaseId);
    revalidatePath("/basket");
    return;
  }

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
      fields: [
        "id",
        "nom",
        "idPoule.id",
        "idPoule.nom",
        "idCompetition.nom",
        "idCompetition.logo.id",
        "idCompetition.categorie.logo.id",
      ],
    });

    if (!engagement?.idPoule?.id) {
      throw new Error(
        "Poule introuvable pour cet ID FFBB. Vérifie l'ID engagement (visible dans l'URL de l'équipe sur competitions.ffbb.com)."
      );
    }

    const pouleId = String(engagement.idPoule.id);
    const competitionName = engagement.idCompetition?.nom || null;
    const pouleLabel = engagement.idPoule?.nom || null;
    const competitionLogoAsset =
      engagement.idCompetition?.logo?.id || engagement.idCompetition?.categorie?.logo?.id || null;

    // Garde-fou : l'ID FFBB renseigné pointe-t-il vers LE BON club ? Piège
    // fréquent en copiant l'ID depuis le site FFBB : cliquer sur l'équipe
    // adverse croisée dans un tableau plutôt que sur sa propre équipe.
    const { data: psRow } = await supabase
      .from("participant_sports")
      .select("club")
      .eq("id", participantSportId)
      .maybeSingle();
    const expectedClub = normalizeClubName(psRow?.club);
    const actualTeam = normalizeClubName(engagement.nom);
    const clubMismatch =
      expectedClub &&
      actualTeam &&
      !actualTeam.includes(expectedClub) &&
      !expectedClub.includes(actualTeam);

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

    // Upsert (pas un remplacement complet) : c'est ce qui garantit qu'une
    // feuille de match ou des statistiques déjà saisies sur un match FFBB
    // survivent à une resynchro — un "delete puis insert" recrée de
    // nouvelles lignes avec de nouveaux id, ce qui supprimerait en cascade
    // tout ce qui y est rattaché (basketball_match_stats, feuille de match).
    if (matchPayload.length > 0) {
      const { error: writeError } = await supabase
        .from("basketball_matches")
        .upsert(matchPayload, { onConflict: "participant_sport_id,ffbb_rencontre_id" });
      if (writeError) {
        throw new Error(`Écriture des matchs impossible (${writeError.message}).`);
      }
    }

    // Nettoyage ciblé : seuls les matchs de CETTE phase qui ne font plus
    // partie de la poule (annulés, ou l'ancien mauvais match d'un ID FFBB
    // corrigé) sont supprimés — jamais ceux encore présents.
    const currentRencontreIds = matchPayload.map((m) => m.ffbb_rencontre_id);
    let staleMatchesQuery = supabase.from("basketball_matches").delete().eq("phase_id", phaseId);
    if (currentRencontreIds.length > 0) {
      staleMatchesQuery = staleMatchesQuery.not(
        "ffbb_rencontre_id",
        "in",
        `(${currentRencontreIds.join(",")})`
      );
    }
    const { error: staleError } = await staleMatchesQuery;
    assertNoError("Nettoyage des matchs obsolètes de cette phase", staleError);

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
        competition_logo_asset: competitionLogoAsset,
        our_team_name: engagement.nom || null,
        last_sync_at: new Date().toISOString(),
        last_sync_error: clubMismatch
          ? `⚠️ Cet ID FFBB correspond à « ${engagement.nom} », qui ne ressemble pas à « ${psRow.club} ». As-tu bien pris l'ID de TON équipe (et pas celui d'un adversaire croisé sur le site FFBB) ?`
          : ourMatchesCount === 0
            ? "Synchro OK mais aucun match trouvé pour cet ID — vérifie qu'il s'agit bien du bon engagement."
            : null,
      })
      .eq("id", phaseId);
    assertNoError("Mise à jour du statut de synchro", okError);
  } catch (err) {
    // La lib ffbb-api-client classe tout HTTP 403 comme une "erreur
    // d'authentification", mais en pratique un 403 sur
    // /items/ffbbserver_engagements/<id> signifie presque toujours que l'ID
    // fourni n'est pas un ID d'ENGAGEMENT valide (ex. un ID de poule ou de
    // phase copié depuis l'URL d'une page de compétition, du style
    // ?poule=... ou ?phase=...) plutôt qu'un vrai souci de jeton d'accès.
    const rawMessage = String(err?.message || err);
    const looksLikeWrongId = rawMessage.includes("403") && rawMessage.includes("engagements");
    const message = looksLikeWrongId
      ? "Cet ID FFBB ne correspond à aucun engagement d'équipe (erreur 403). Vérifie que tu as bien copié l'ID depuis l'URL de la page de L'ÉQUIPE (.../equipes/<ID>) et non depuis un lien de compétition ou de poule (paramètres ?poule=... ou ?phase=... dans l'URL)."
      : rawMessage.slice(0, 300);

    await supabase
      .from("basketball_phases")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: message,
      })
      .eq("id", phaseId);
  }

  revalidatePath("/basket");
}
