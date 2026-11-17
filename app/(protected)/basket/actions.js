"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeCurrentSeasonLabel } from "@/lib/utils";
import { parseCompetitionUrl, pouleFromPages } from "@/lib/ffbbPage";
import {
  clubEngagementsIn,
  competitionUrl,
  identifyTeam,
  isCup,
  phaseNumberOf,
  resolveTargets,
  seasonOfPoule,
  targetLabel,
  teamMatchesTarget,
} from "@/lib/ffbbClub";

// Supabase-js ne lève pas d'exception sur une erreur de requête : il faut
// vérifier { error } explicitement, sinon un échec passe inaperçu.
function assertNoError(step, error) {
  if (error) {
    throw new Error(`${step} : ${error.message}`);
  }
}

// Verrou "saison archivée" : toute saison différente de la saison en cours
// est en lecture seule, pour toujours — qu'il s'agisse d'un historique
// saisi à la main ou d'anciennes saisons FFBB. Chaque action qui modifie un
// match, une feuille de match ou une phase vérifie sa saison avant d'écrire
// quoi que ce soit ; en cas de blocage, elle ne fait rien silencieusement
// (l'UI, elle, ne propose déjà plus ces actions pour une saison archivée —
// ceci est le filet de sécurité côté serveur, pour le cas où l'action serait
// déclenchée directement).
async function matchSeason(supabase, matchId) {
  const { data } = await supabase.from("basketball_matches").select("season").eq("id", matchId).maybeSingle();
  return data?.season ?? null;
}
async function phaseSeason(supabase, phaseId) {
  const { data } = await supabase.from("basketball_phases").select("season").eq("id", phaseId).maybeSingle();
  return data?.season ?? null;
}
function isCurrentSeason(season) {
  return season != null && season === computeCurrentSeasonLabel();
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
    .select("us_is_team1, source, season")
    .eq("id", matchId)
    .single();
  if (readError || !match) {
    console.error("saveMatchSheet: lecture du match impossible", readError);
    revalidatePath("/basket");
    return;
  }
  if (!isCurrentSeason(match.season)) {
    revalidatePath("/basket");
    return;
  }

  const quarters = [1, 2, 3, 4, 5, 6, 7, 8].map((q) => {
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

// Modification MANUELLE de la date et de l'heure d'un match à venir (utile quand la
// synchro FFBB est indisponible, ou pour renseigner une heure encore à « 0:00 »).
// match_date est stocké comme l'horloge de Paris lue en UTC (convention de l'appli) :
// on enregistre donc la valeur saisie telle quelle, en UTC. Une synchro FFBB réussie
// remettra, pour un match synchronisé, la date officielle.
export async function updateMatchDate(formData) {
  const supabase = createClient();
  const matchId = formData.get("match_id");
  const raw = String(formData.get("match_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    revalidatePath("/basket");
    return;
  }
  const { data: match } = await supabase
    .from("basketball_matches")
    .select("status")
    .eq("id", matchId)
    .maybeSingle();
  if (!match || match.status === "joue") {
    revalidatePath("/basket");
    return;
  }
  const value = raw.length === 16 ? `${raw}:00+00:00` : `${raw}+00:00`;
  const { error } = await supabase.from("basketball_matches").update({ match_date: value }).eq("id", matchId);
  assertNoError("Modification de la date du match", error);

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
  const participantSportId = formData.get("participant_sport_id");
  const isSelf = formData.get("is_self") === "on";

  // Une seule joueuse "moi-même" possible par équipe : on désélectionne
  // l'ancienne avant d'insérer la nouvelle plutôt que de compter sur la
  // contrainte unique en base (qui, elle, ne fait que garantir qu'on ne se
  // retrouve jamais avec deux lignes à true en cas d'oubli ici).
  if (isSelf && participantSportId) {
    await supabase
      .from("basketball_players")
      .update({ is_self: false })
      .eq("participant_sport_id", participantSportId);
  }

  const { error } = await supabase.from("basketball_players").insert({
    participant_sport_id: participantSportId,
    role,
    name,
    last_name: lastName || null,
    first_name: firstName || null,
    club: formData.get("club") || null,
    licence_number: formData.get("licence_number") || null,
    national_number: formData.get("national_number") || null,
    licence_type: formData.get("licence_type") || null,
    licence_not_presented: formData.get("licence_not_presented") === "on",
    is_self: isSelf,
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

// Modification d'une fiche existante — mêmes champs qu'addPlayer, mais une
// mise à jour plutôt qu'une création. Volontairement séparée de la
// suppression : modifier une fiche ne doit jamais pouvoir l'effacer par
// erreur (voir deletePlayer, toujours derrière une confirmation dédiée).
export async function updatePlayer(formData) {
  const supabase = createClient();
  const playerId = formData.get("player_id");
  const lastName = formData.get("last_name");
  const firstName = formData.get("first_name");
  if (!playerId || (!lastName && !firstName)) {
    revalidatePath("/basket");
    return;
  }

  const role = formData.get("role") === "entraineur" ? "entraineur" : "joueur";
  const name = [lastName, firstName].filter(Boolean).join(" ") || "Sans nom";
  const isSelf = formData.get("is_self") === "on";

  // Récupère l'équipe de cette joueuse pour pouvoir désélectionner l'ancienne
  // "moi-même" si besoin (participant_sport_id n'est pas dans ce formulaire,
  // volontairement non modifiable depuis la fiche d'une joueuse existante).
  if (isSelf) {
    const { data: current } = await supabase
      .from("basketball_players")
      .select("participant_sport_id")
      .eq("id", playerId)
      .maybeSingle();
    if (current?.participant_sport_id) {
      await supabase
        .from("basketball_players")
        .update({ is_self: false })
        .eq("participant_sport_id", current.participant_sport_id)
        .neq("id", playerId);
    }
  }

  const { error } = await supabase
    .from("basketball_players")
    .update({
      role,
      name,
      last_name: lastName || null,
      first_name: firstName || null,
      club: formData.get("club") || null,
      licence_number: formData.get("licence_number") || null,
      national_number: formData.get("national_number") || null,
      licence_type: formData.get("licence_type") || null,
      licence_not_presented: formData.get("licence_not_presented") === "on",
      is_self: isSelf,
      jersey_number:
        role === "joueur" && formData.get("jersey_number") !== "" ? Number(formData.get("jersey_number")) : null,
      surclassement: role === "joueur" ? formData.get("surclassement") || null : null,
      is_default_captain: role === "joueur" && formData.get("is_default_captain") === "on",
      diplome: role === "entraineur" ? formData.get("diplome") || null : null,
      is_adjoint: role === "entraineur" && formData.get("is_adjoint") === "on",
    })
    .eq("id", playerId);
  assertNoError("Mise à jour de la fiche", error);

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
  const { minutesToSeconds } = await import("@/lib/teamstats");
  const supabase = createClient();
  const matchId = formData.get("match_id");
  const playerIds = formData.getAll("player_id");
  const period = formData.get("period");

  if (playerIds.length === 0) {
    revalidatePath("/basket");
    return;
  }
  if (!isCurrentSeason(await matchSeason(supabase, matchId))) {
    revalidatePath("/basket");
    return;
  }

  const numberOr0 = (v) => (v !== null && v !== "" ? Number(v) : 0);
  const numberOrNull = (v) => (v !== null && v !== "" ? Number(v) : null);

  // Toujours enregistrables quel que soit l'onglet : numéro du jour et
  // sélection dans le cinq de départ (concept par match, pas par période,
  // sauf lorsqu'il existe des périodes importées — dans ce cas la case "5
  // majeur" n'est proposée que sur les onglets Q1..Qn, jamais sur TOUT).
  const jerseyRows = playerIds.map((playerId) => ({
    match_id: matchId,
    player_id: playerId,
    jersey_number_match: numberOrNull(formData.get(`jersey_match_${playerId}`)),
    updated_at: new Date().toISOString(),
  }));

  if (period) {
    // Édition d'un quart-temps précis : on écrit dans basketball_match_period_stats,
    // puis on recalcule le total du match (basketball_match_stats) comme la
    // somme de TOUTES les périodes connues, pour que ce total (lu par les
    // graphiques) reste toujours exact sans jamais avoir à le ressaisir.
    const periodNum = Number(period);
    const periodRows = playerIds.map((playerId) => ({
      match_id: matchId,
      player_id: playerId,
      period: periodNum,
      is_starter: formData.get(`starting_${playerId}`) === "on",
      playing_time_seconds: minutesToSeconds(formData.get(`minutes_${playerId}`)),
      ft_made: numberOr0(formData.get(`ft_made_${playerId}`)),
      ft_att: numberOr0(formData.get(`ft_att_${playerId}`)),
      pts2_made: numberOr0(formData.get(`two_made_${playerId}`)),
      pts2_att: numberOr0(formData.get(`two_att_${playerId}`)),
      pts3_made: numberOr0(formData.get(`three_made_${playerId}`)),
      pts3_att: numberOr0(formData.get(`three_att_${playerId}`)),
      reb_off: numberOr0(formData.get(`reb_off_${playerId}`)),
      reb_def: numberOr0(formData.get(`reb_def_${playerId}`)),
      assists: numberOr0(formData.get(`assists_${playerId}`)),
      fouls: numberOr0(formData.get(`fouls_${playerId}`)),
      fouls_drawn: numberOr0(formData.get(`fouls_drawn_${playerId}`)),
      points:
        numberOr0(formData.get(`two_made_${playerId}`)) * 2 +
        numberOr0(formData.get(`three_made_${playerId}`)) * 3 +
        numberOr0(formData.get(`ft_made_${playerId}`)),
    }));

    const [{ error: periodErr }, { error: jerseyErr }] = await Promise.all([
      supabase.from("basketball_match_period_stats").upsert(periodRows, { onConflict: "match_id,player_id,period" }),
      supabase.from("basketball_match_stats").upsert(jerseyRows, { onConflict: "match_id,player_id" }),
    ]);
    if (periodErr || jerseyErr) throw new Error((periodErr || jerseyErr).message);

    // Recalcule et réécrit le total à partir de TOUTES les périodes en base
    // (pas seulement celle qu'on vient d'éditer).
    const { data: allPeriodRows } = await supabase
      .from("basketball_match_period_stats")
      .select("*")
      .eq("match_id", matchId);
    const totalsByPlayer = new Map();
    for (const r of allPeriodRows ?? []) {
      const cur = totalsByPlayer.get(r.player_id) ?? {
        playing_time_seconds: 0,
        ft_made: 0,
        ft_att: 0,
        two_made: 0,
        two_att: 0,
        three_made: 0,
        three_att: 0,
        reb_off: 0,
        reb_def: 0,
        assists: 0,
        fouls: 0,
        fouls_drawn: 0,
      };
      cur.playing_time_seconds += r.playing_time_seconds ?? 0;
      cur.ft_made += r.ft_made ?? 0;
      cur.ft_att += r.ft_att ?? 0;
      cur.two_made += r.pts2_made ?? 0;
      cur.two_att += r.pts2_att ?? 0;
      cur.three_made += r.pts3_made ?? 0;
      cur.three_att += r.pts3_att ?? 0;
      cur.reb_off += r.reb_off ?? 0;
      cur.reb_def += r.reb_def ?? 0;
      cur.assists += r.assists ?? 0;
      cur.fouls += r.fouls ?? 0;
      cur.fouls_drawn += r.fouls_drawn ?? 0;
      totalsByPlayer.set(r.player_id, cur);
    }
    const { secondsToMinutes } = await import("@/lib/teamstats");
    const totalRows = Array.from(totalsByPlayer.entries()).map(([playerId, t]) => ({
      match_id: matchId,
      player_id: playerId,
      minutes_played: secondsToMinutes(t.playing_time_seconds),
      ft_made: t.ft_made,
      ft_att: t.ft_att,
      two_made: t.two_made,
      two_att: t.two_att,
      three_made: t.three_made,
      three_att: t.three_att,
      reb_off: t.reb_off,
      reb_def: t.reb_def,
      assists: t.assists,
      fouls: t.fouls,
      fouls_drawn: t.fouls_drawn,
      updated_at: new Date().toISOString(),
    }));
    if (totalRows.length > 0) {
      const { error: totalsErr } = await supabase
        .from("basketball_match_stats")
        .upsert(totalRows, { onConflict: "match_id,player_id" });
      if (totalsErr) throw new Error(totalsErr.message);
    }

    revalidatePath("/basket");
    return;
  }

  // Pas de période (match sans import TeamStats) : formulaire de saisie
  // manuelle classique, directement sur le total du match.
  const rows = playerIds.map((playerId) => ({
    match_id: matchId,
    player_id: playerId,
    jersey_number_match: numberOrNull(formData.get(`jersey_match_${playerId}`)),
    fouls: numberOr0(formData.get(`fouls_${playerId}`)),
    fouls_drawn: numberOr0(formData.get(`fouls_drawn_${playerId}`)),
    ft_made: numberOr0(formData.get(`ft_made_${playerId}`)),
    ft_att: numberOr0(formData.get(`ft_att_${playerId}`)),
    two_made: numberOr0(formData.get(`two_made_${playerId}`)),
    two_att: numberOr0(formData.get(`two_att_${playerId}`)),
    three_made: numberOr0(formData.get(`three_made_${playerId}`)),
    three_att: numberOr0(formData.get(`three_att_${playerId}`)),
    reb_off: numberOr0(formData.get(`reb_off_${playerId}`)),
    reb_def: numberOr0(formData.get(`reb_def_${playerId}`)),
    assists: numberOr0(formData.get(`assists_${playerId}`)),
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

  if (!isCurrentSeason(await matchSeason(supabase, matchId))) {
    revalidatePath("/basket");
    return;
  }

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
    .select("source, season")
    .eq("id", matchId)
    .maybeSingle();
  if (!isCurrentSeason(match?.season)) {
    revalidatePath("/basket");
    return;
  }

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
  // On ne supprime jamais un match officiel issu d'une synchro FFBB (il
  // reviendrait de toute façon à la prochaine synchro), ni un match d'une
  // saison archivée (peu importe sa source) — les deux filtres sont
  // cumulatifs dans la même requête.
  await supabase
    .from("basketball_matches")
    .delete()
    .eq("id", formData.get("match_id"))
    .eq("source", "manuel")
    .eq("season", computeCurrentSeasonLabel());
  revalidatePath("/basket");
}

// "NEUVILLE BASKET - 2" -> "NEUVILLE BASKET" : retire le suffixe de numéro
// d'équipe pour obtenir la clé de club (basketball_clubs.club_key). Un club
// engageant plusieurs équipes (ex. "- 1", "- 2") partage ainsi la même fiche
// (logo, gymnase, adresse) entre toutes ses équipes.
function stripTeamSuffix(name) {
  return (name || "").trim().replace(/\s*-\s*\d+\s*$/, "");
}

// Alimente basketball_clubs à partir des rencontres d'une synchro — jamais
// destructeur : un champ déjà renseigné (à la main ou par une synchro
// précédente) n'est jamais écrasé, sauf logo_url qui reste réservé à une
// saisie manuelle (la FFBB n'a pas toujours de logo pour notre propre club,
// par exemple) et n'est donc jamais touché ici.
async function upsertClubsFromRencontres(supabase, rencontres) {
  const candidates = new Map();
  const merge = (name, { organismeId, logoAsset, gymnase, adresse }) => {
    if (!name) return;
    const key = stripTeamSuffix(name);
    if (!key) return;
    const existing = candidates.get(key) || { display_name: name };
    candidates.set(key, {
      display_name: name,
      ffbb_organisme_id: existing.ffbb_organisme_id ?? organismeId ?? null,
      logo_asset: existing.logo_asset ?? logoAsset ?? null,
      gymnase: existing.gymnase ?? gymnase ?? null,
      adresse: existing.adresse ?? adresse ?? null,
    });
  };

  for (const r of rencontres) {
    const location = [r.salle?.libelle, r.salle?.commune?.libelle].filter(Boolean).join(", ");
    // Convention FFBB reprise dans toute l'appli : équipe 1 = domicile ->
    // c'est donc son club qui joue dans la salle indiquée.
    merge(r.nomEquipe1, {
      organismeId: r.idOrganismeEquipe1?.id != null ? String(r.idOrganismeEquipe1.id) : null,
      logoAsset: r.idOrganismeEquipe1?.logo?.id || null,
      gymnase: r.salle?.libelle || null,
      adresse: r.salle?.adresse || location || null,
    });
    merge(r.nomEquipe2, {
      organismeId: r.idOrganismeEquipe2?.id != null ? String(r.idOrganismeEquipe2.id) : null,
      logoAsset: r.idOrganismeEquipe2?.logo?.id || null,
      gymnase: null,
      adresse: null,
    });
  }

  if (candidates.size === 0) return;

  const keys = [...candidates.keys()];
  const { data: existingRows } = await supabase
    .from("basketball_clubs")
    .select("club_key, ffbb_organisme_id, logo_asset, gymnase, adresse")
    .in("club_key", keys);
  const existingByKey = new Map((existingRows ?? []).map((row) => [row.club_key, row]));

  const rows = keys.map((key) => {
    const c = candidates.get(key);
    const existing = existingByKey.get(key);
    return {
      club_key: key,
      display_name: c.display_name,
      // Ne remplit que ce qui manque encore — ne jamais écraser une valeur
      // déjà connue (saisie manuelle ou synchro précédente).
      ffbb_organisme_id: existing?.ffbb_organisme_id ?? c.ffbb_organisme_id,
      logo_asset: existing?.logo_asset ?? c.logo_asset,
      gymnase: existing?.gymnase ?? c.gymnase,
      adresse: existing?.adresse ?? c.adresse,
      updated_at: new Date().toISOString(),
    };
  });

  await supabase.from("basketball_clubs").upsert(rows, { onConflict: "club_key" });
}

// ---- Clubs et équipes de toute la région Auvergne-Rhône-Alpes ----------------
// Même principe que les calendriers : MiseAJourFFBB_ClubsARA.exe (lancé depuis le PC, car
// competitions.ffbb.com bloque les serveurs) dépose ses lectures dans ffbb_clubs_cache ; ce
// bouton les range dans basketball_clubs (nom, logo, code FFBB) et basketball_club_teams (équipes
// de la saison en cours). Jamais destructeur : un champ de club déjà renseigné (à la main ou par
// une synchro de match) n'est pas remplacé, et une équipe d'une autre saison n'est pas réécrite.
export async function importRegionClubs() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const season = computeCurrentSeasonLabel();
  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const now = new Date().toISOString();

  try {
    // 1) Le dépôt du programme (par pages : l'API plafonne à 1000 lignes par lecture).
    const rows = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase
        .from("ffbb_clubs_cache")
        .select("club_code, comite_code, data, fetched_at")
        .order("club_code")
        .range(from, from + 499);
      if (error) {
        throw new Error(
          `Lecture du dépôt impossible (${error.message}). As-tu exécuté supabase/12-clubs-region.sql ?`
        );
      }
      rows.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    if (rows.length === 0) {
      throw new Error("Le dépôt est vide : lance d'abord MiseAJourFFBB_ClubsARA.exe depuis un PC.");
    }

    // 2) Les clubs (dédoublonnés par clé : deux clubs peuvent se réduire à la même clé une fois le
    //    suffixe d'équipe retiré, et Postgres refuse deux fois la même clé dans un upsert).
    const clubs = new Map();
    for (const r of rows) {
      const nom = r.data?.nom;
      const key = stripTeamSuffix(nom);
      if (!key || clubs.has(key)) continue;
      clubs.set(key, { code: r.club_code, comite: r.comite_code, nom, logo: r.data?.logo_asset ?? null });
    }
    const existing = new Map();
    for (const keys of chunk([...clubs.keys()], 200)) {
      const { data, error } = await supabase
        .from("basketball_clubs")
        .select("club_key, display_name, ffbb_organisme_id, logo_asset, gymnase, adresse, ffbb_code, comite_code")
        .in("club_key", keys);
      if (error) throw new Error(`Lecture des clubs impossible (${error.message}).`);
      for (const row of data ?? []) existing.set(row.club_key, row);
    }
    const clubRows = [...clubs.entries()].map(([key, c]) => {
      const ex = existing.get(key);
      return {
        club_key: key,
        display_name: ex?.display_name ?? stripTeamSuffix(c.nom),
        ffbb_organisme_id: ex?.ffbb_organisme_id ?? null,
        logo_asset: ex?.logo_asset ?? c.logo,
        gymnase: ex?.gymnase ?? null,
        adresse: ex?.adresse ?? null,
        ffbb_code: ex?.ffbb_code ?? c.code,
        comite_code: ex?.comite_code ?? c.comite ?? null,
        updated_at: now,
      };
    });
    for (const part of chunk(clubRows, 500)) {
      const { error } = await supabase.from("basketball_clubs").upsert(part, { onConflict: "club_key" });
      if (error) throw new Error(`Écriture des clubs impossible (${error.message}).`);
    }

    // 3) Les équipes de la saison en cours (celles d'une autre saison ne sont jamais réécrites).
    const teams = new Map();
    for (const r of rows) {
      const key = stripTeamSuffix(r.data?.nom);
      if (!key) continue;
      for (const t of r.data?.equipes ?? []) {
        const id = t?.engagement_id ? String(t.engagement_id) : null;
        if (!id || teams.has(id)) continue;
        teams.set(id, {
          engagement_id: id,
          club_key: key,
          club_code: r.club_code,
          team_name: t.nom || null,
          season,
          updated_at: now,
        });
      }
    }
    const otherSeason = new Set();
    for (const ids of chunk([...teams.keys()], 200)) {
      const { data, error } = await supabase
        .from("basketball_club_teams")
        .select("engagement_id, season")
        .in("engagement_id", ids);
      if (error) throw new Error(`Lecture des équipes impossible (${error.message}).`);
      for (const row of data ?? []) if (row.season && row.season !== season) otherSeason.add(String(row.engagement_id));
    }
    const teamRows = [...teams.values()].filter((t) => !otherSeason.has(t.engagement_id));
    for (const part of chunk(teamRows, 500)) {
      const { error } = await supabase.from("basketball_club_teams").upsert(part, { onConflict: "engagement_id" });
      if (error) throw new Error(`Écriture des équipes impossible (${error.message}).`);
    }

    const last = rows.map((r) => r.fetched_at).filter(Boolean).sort().pop();
    const when = last
      ? new Date(last).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "?";
    await supabase.from("basketball_comite_imports").upsert({
      comite_code: "ARA",
      last_sync_at: now,
      last_sync_error: null,
      last_sync_summary: `${clubRows.length} club(s), ${teamRows.length} équipe(s) importé(s) (dépôt du ${when}).`,
    });
  } catch (err) {
    await supabase.from("basketball_comite_imports").upsert({
      comite_code: "ARA",
      last_sync_at: now,
      last_sync_error: String(err?.message || err).slice(0, 300),
    });
  }

  revalidatePath("/basket");
}

// ---- « Mettre à jour les calendriers & résultats » (synchro globale) ---------
// Un seul bouton pour TOUTES les participantes : on lit le cache FFBB (rempli par
// MiseAJourFFBB_Club.exe) une seule fois, poule par poule ; pour chaque poule de la saison en
// cours, on regarde si une équipe du club est celle d'une participante (voir lib/ffbbClub.js :
// resolveTargets) et, si oui, on crée ou met à jour automatiquement sa phase, ses matchs et son
// classement. Plus de phase à définir, ni d'ID d'engagement, ni de lien de poule.
//
// Garde-fous « jamais d'écrasement d'une saison précédente » :
//  - une poule dont les matchs ne sont pas de la saison en cours est ignorée ;
//  - seules les phases de la saison en cours sont lues / créées / modifiées ;
//  - un match déjà rattaché à une autre saison n'est jamais réécrit ;
//  - le nettoyage ne supprime que des matchs FFBB de la phase en cours ;
//  - un score saisi à la main n'est pas effacé si la FFBB n'en publie pas encore.
// L'écran appelle ces actions par lots (voir components/SyncTeamsButton.jsx), pour rester
// sous la limite de durée de Vercel.

const SYNC_BATCH_MAX = 6;

// Les participantes du basket, leurs équipes FFBB suivies et leurs phases de la saison en cours.
async function loadSyncContexts(supabase) {
  const season = computeCurrentSeasonLabel();
  const { data: sport } = await supabase.from("sports").select("id").eq("slug", "basket").maybeSingle();
  if (!sport) return { error: "Sport Basket introuvable." };

  const { data: assignments, error } = await supabase
    .from("participant_sports")
    .select("*, participants(first_name)")
    .eq("sport_id", sport.id);
  if (error) return { error: `Lecture des participantes impossible (${error.message}).` };
  if (!assignments || assignments.length === 0) return { error: "Aucune participante n'est associée au basket." };

  const { data: phases, error: phError } = await supabase
    .from("basketball_phases")
    .select("*")
    .in("participant_sport_id", assignments.map((a) => a.id))
    .eq("season", season);
  if (phError) return { error: `Lecture des phases impossible (${phError.message}).` };

  const contexts = assignments.map((ps) => {
    const name = ps.participants?.first_name || "Participante";
    const resolved = resolveTargets(ps, (phases ?? []).filter((p) => p.participant_sport_id === ps.id));
    return resolved.error ? { ps, name, error: resolved.error } : { ps, name, targets: resolved.targets, source: resolved.source };
  });
  return { season, contexts };
}

export async function prepareTeamsSync() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const loaded = await loadSyncContexts(supabase);
  if (loaded.error) return { error: loaded.error };
  const { season, contexts } = loaded;
  if (!contexts.some((c) => c.targets)) {
    return { error: contexts.map((c) => `${c.name} : ${c.error}`).join(" · ") };
  }

  const { data: rows, error } = await supabase.from("ffbb_poule_cache").select("poule_id, fetched_at").order("poule_id");
  if (error) return { error: `Lecture du cache FFBB impossible (${error.message}).` };
  if (!rows || rows.length === 0) {
    return { error: "Le cache FFBB est vide : lance d'abord MiseAJourFFBB_Club.exe depuis un PC." };
  }
  return {
    season,
    pouleIds: rows.map((r) => String(r.poule_id)),
    participants: contexts.map((c) => ({
      name: c.name,
      teams: c.targets ? c.targets.map(targetLabel) : [],
      error: c.error ?? null,
    })),
  };
}

export async function syncTeamsBatch(pouleIds) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const ids = (Array.isArray(pouleIds) ? pouleIds : []).map(String).slice(0, SYNC_BATCH_MAX);
  if (ids.length === 0) return { results: [] };

  const loaded = await loadSyncContexts(supabase);
  if (loaded.error) return { error: loaded.error };

  const { data: cached, error } = await supabase
    .from("ffbb_poule_cache")
    .select("poule_id, data, fetched_at")
    .in("poule_id", ids);
  if (error) return { error: `Lecture du cache FFBB impossible (${error.message}).` };

  const results = [];
  for (const id of ids) {
    const row = (cached ?? []).find((c) => String(c.poule_id) === id);
    if (!row) {
      results.push({ pouleId: id, status: "erreur", message: "Absente du cache.", matches: 0 });
      continue;
    }
    try {
      results.push(await syncOnePoule(supabase, loaded, id, row));
    } catch (err) {
      results.push({ pouleId: id, status: "erreur", message: String(err?.message || err).slice(0, 300), matches: 0 });
    }
  }
  revalidatePath("/basket");
  return { results };
}

// Une poule : lue et analysée UNE fois, puis appliquée à chaque participante concernée.
async function syncOnePoule(supabase, loaded, pouleId, row) {
  const { season, contexts } = loaded;
  const res = { pouleId, status: "ok", message: "", matches: 0 };

  // 1) Lecture de la poule dans le cache. Filtre rapide avant l'analyse (lourde) : la page
  //    doit contenir le nom du club.
  const data = row.data;
  let poule = null;
  if (data?.rencontres?.length) {
    poule = data;
  } else if (Array.isArray(data?.pages) && data.pages.length > 0) {
    const hasClub = data.pages.some((h) => typeof h === "string" && /OLYMPIC\s+SATHONAY/i.test(h));
    if (!hasClub) return { ...res, status: "ignoree", message: "Aucune équipe du club dans cette poule." };
    poule = pouleFromPages(data.pages, pouleId);
  } else {
    return { ...res, status: "erreur", message: "Format de cache non reconnu (pas de pages)." };
  }
  if (!poule.rencontres || poule.rencontres.length === 0) {
    return { ...res, status: "erreur", message: "Aucun match lu dans les pages du cache." };
  }

  // 2) Saison : jamais autre chose que la saison en cours.
  const pSeason = seasonOfPoule(poule);
  if (pSeason !== season) {
    return { ...res, status: "ignoree", message: `Poule de la saison ${pSeason ?? "inconnue"} : non modifiée.` };
  }

  // 3) Équipes du club présentes dans la poule.
  const ours = clubEngagementsIn(poule);
  if (ours.length === 0) return { ...res, status: "ignoree", message: "Aucune équipe du club dans cette poule." };
  const identified = ours.map((eng) => ({ eng, ident: identifyTeam(poule.competitionName, eng.teamName) }));

  // 4) Pour chaque participante dont une équipe est dans la poule : phase + matchs + classement.
  const done = [];
  const failed = [];
  let clubsDone = false;
  for (const ctx of contexts) {
    if (!ctx.targets) continue;
    const chosen = identified.find((x) => ctx.targets.some((t) => teamMatchesTarget(t, x.ident)));
    if (!chosen) continue;
    try {
      if (!clubsDone) {
        await upsertClubsFromRencontres(supabase, poule.rencontres);
        clubsDone = true;
      }
      done.push(await applyPouleToParticipant(supabase, { season, ctx, poule, pouleId, chosen, fetchedAt: row.fetched_at }));
    } catch (err) {
      failed.push(`${ctx.name} : ${String(err?.message || err).slice(0, 200)}`);
    }
  }

  if (done.length === 0 && failed.length === 0) {
    return {
      ...res,
      status: "ignoree",
      message: `Équipe(s) du club (${identified.map((x) => x.ident.label).join(", ")}) : aucune participante concernée.`,
    };
  }
  const parts = [
    ...done.map(
      (d) =>
        `${d.name} — ${d.label} — ${d.phaseName} : ${d.matches} match(s)${
          d.archived ? ` (${d.archived} d'une saison précédente laissé(s) intact(s))` : ""
        }`
    ),
    ...failed,
  ];
  return { ...res, status: failed.length > 0 ? "erreur" : "ok", message: parts.join(" · "), matches: done.reduce((n, d) => n + d.matches, 0) };
}

// Crée ou met à jour la phase d'UNE participante pour cette poule, puis ses matchs et son classement.
async function applyPouleToParticipant(supabase, { season, ctx, poule, pouleId, chosen, fetchedAt }) {
  const { ps, targets, name } = ctx;
  const { eng, ident } = chosen;

  // La phase : on réutilise celle de la saison en cours si elle existe (mêmes feuilles de
  // match, stats et effectif), sinon on la crée.
  const { data: phases, error: phError } = await supabase
    .from("basketball_phases")
    .select("*")
    .eq("participant_sport_id", ps.id)
    .eq("season", season);
  if (phError) throw new Error(`Lecture des phases : ${phError.message}`);

  let phase = (phases ?? []).find(
    (p) =>
      String(p.poule_id ?? "") === pouleId ||
      parseCompetitionUrl(p.competition_url)?.pouleId === pouleId ||
      (p.ffbb_engagement_id && String(p.ffbb_engagement_id) === eng.engagementId)
  );

  const phaseNum = phaseNumberOf(poule.phaseLabel ?? poule.competitionName);
  const cup = isCup(poule.competitionName);
  const url = competitionUrl(poule.competitionCode, pouleId, poule.competitionId, poule.competitionPrefix);
  const phaseFields = {
    ffbb_engagement_id: eng.engagementId,
    poule_id: pouleId,
    competition_name: poule.competitionName || null,
    poule_label: poule.pouleNom || null,
    competition_logo_asset: poule.competitionLogoAsset || null,
    our_team_name: eng.teamName || null,
  };

  if (phase) {
    const { error } = await supabase
      .from("basketball_phases")
      .update({ ...phaseFields, competition_url: phase.competition_url || url })
      .eq("id", phase.id);
    if (error) throw new Error(`Mise à jour de la phase : ${error.message}`);
  } else {
    const taken = new Set((phases ?? []).map((p) => p.phase_name));
    const base = cup ? "Coupe" : phaseNum === 1 ? "Saison régulière" : `Phase ${phaseNum}`;
    let phaseName = targets.length > 1 ? `${ident.label} · ${base}` : base;
    if (taken.has(phaseName)) phaseName = `${phaseName} (poule ${poule.pouleNom || pouleId})`;
    const usedPositions = new Set((phases ?? []).map((p) => p.position));
    const position =
      !cup && !usedPositions.has(phaseNum)
        ? phaseNum
        : Math.max(0, ...(phases ?? []).map((p) => p.position ?? 0)) + 1;
    const { data: created, error } = await supabase
      .from("basketball_phases")
      .insert({
        participant_sport_id: ps.id,
        season,
        phase_type: "ffbb",
        phase_name: phaseName,
        competition_url: url,
        position,
        ...phaseFields,
      })
      .select("*")
      .single();
    if (error || !created) throw new Error(`Création de la phase : ${error?.message}`);
    phase = created;
  }

  // Les matchs de toute la poule (us_is_team1 = null pour ceux qui ne nous concernent pas).
  const payload = poule.rencontres.map((r) => {
    const isTeam1 = String(r.idEngagementEquipe1?.id) === eng.engagementId;
    const isTeam2 = String(r.idEngagementEquipe2?.id) === eng.engagementId;
    const usIsTeam1 = isTeam1 ? true : isTeam2 ? false : null;
    const location = [r.salle?.libelle, r.salle?.commune?.libelle].filter(Boolean).join(", ");
    const opponent = usIsTeam1 === true ? r.nomEquipe2 : usIsTeam1 === false ? r.nomEquipe1 : null;
    const usScore = usIsTeam1 === true ? r.resultatEquipe1 : usIsTeam1 === false ? r.resultatEquipe2 : null;
    const themScore = usIsTeam1 === true ? r.resultatEquipe2 : usIsTeam1 === false ? r.resultatEquipe1 : null;
    return {
      participant_sport_id: ps.id,
      phase_id: phase.id,
      ffbb_rencontre_id: String(r.id),
      poule_id: pouleId,
      season,
      division_label: poule.competitionName || null,
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

  // Matchs déjà en base : on n'écrase jamais ceux d'une autre saison, et on garde un score
  // déjà enregistré si la FFBB n'en publie pas encore.
  const allIds = payload.map((m) => m.ffbb_rencontre_id);
  const existing = new Map();
  for (let i = 0; i < allIds.length; i += 100) {
    const { data: rows, error } = await supabase
      .from("basketball_matches")
      .select("ffbb_rencontre_id, season, status, team1_score, team2_score, team_score_us, team_score_them")
      .eq("participant_sport_id", ps.id)
      .in("ffbb_rencontre_id", allIds.slice(i, i + 100));
    if (error) throw new Error(`Lecture des matchs existants : ${error.message}`);
    for (const row of rows ?? []) existing.set(String(row.ffbb_rencontre_id), row);
  }
  let archived = 0;
  const toWrite = [];
  for (const m of payload) {
    const ex = existing.get(m.ffbb_rencontre_id);
    if (ex && ex.season && ex.season !== season) {
      archived += 1;
      continue;
    }
    if (ex && m.team1_score == null && m.team2_score == null && ex.status === "joue" && ex.team1_score != null) {
      m.status = "joue";
      m.team1_score = ex.team1_score;
      m.team2_score = ex.team2_score;
      m.team_score_us = ex.team_score_us;
      m.team_score_them = ex.team_score_them;
    }
    toWrite.push(m);
  }
  for (let i = 0; i < toWrite.length; i += 200) {
    const { error } = await supabase
      .from("basketball_matches")
      .upsert(toWrite.slice(i, i + 200), { onConflict: "participant_sport_id,ffbb_rencontre_id" });
    if (error) throw new Error(`Écriture des matchs : ${error.message}`);
  }

  // Nettoyage : seulement des matchs FFBB de CETTE phase (saison en cours) disparus de la poule.
  if (allIds.length > 0) {
    const { error } = await supabase
      .from("basketball_matches")
      .delete()
      .eq("phase_id", phase.id)
      .eq("season", season)
      .eq("source", "ffbb")
      .not("ffbb_rencontre_id", "in", `(${allIds.join(",")})`);
    if (error) throw new Error(`Nettoyage des matchs : ${error.message}`);
  }

  // Classement. On utilise celui de la FFBB seulement s'il contient TOUTES les équipes de la poule
  // (les équipes sont lues dans les matchs). Sinon (la page n'en publie que 5 sur 6, ou avec d'autres
  // identifiants que les matchs...), on le recalcule à partir des matchs de la poule, qui sont complets.
  const isExempt = (n) => !n || String(n).trim().toLowerCase() === "exempt";
  const pouleTeams = new Map(); // id d'engagement -> nom
  for (const r of poule.rencontres) {
    if (!isExempt(r.nomEquipe1) && r.idEngagementEquipe1?.id) pouleTeams.set(String(r.idEngagementEquipe1.id), r.nomEquipe1);
    if (!isExempt(r.nomEquipe2) && r.idEngagementEquipe2?.id) pouleTeams.set(String(r.idEngagementEquipe2.id), r.nomEquipe2);
  }
  const official = (poule.classements ?? []).filter((c) => c.idEngagement?.id);
  const officialIds = new Set(official.map((c) => String(c.idEngagement.id)));
  const missing = [...pouleTeams.keys()].filter((id) => !officialIds.has(id));
  const officialRow = (c) => ({
    participant_sport_id: ps.id,
    phase_id: phase.id,
    poule_id: pouleId,
    season,
    engagement_id: String(c.idEngagement.id),
    engagement_nom: c.idEngagement.nom || pouleTeams.get(String(c.idEngagement.id)) || "Équipe inconnue",
    position: c.position ?? null,
    points: c.points ?? null,
    matches_joues: c.matchJoues ?? null,
    gagnes: c.gagnes ?? null,
    perdus: c.perdus ?? null,
    is_us: String(c.idEngagement.id) === eng.engagementId,
    synced_at: new Date().toISOString(),
  });
  const writeStandings = async (rows) => {
    const { error: delError } = await supabase.from("basketball_classements").delete().eq("phase_id", phase.id);
    if (delError) throw new Error(`Nettoyage du classement : ${delError.message}`);
    const { error: insError } = await supabase.from("basketball_classements").insert(rows);
    if (insError) throw new Error(`Écriture du classement : ${insError.message}`);
  };

  let classementNote = null;
  if (official.length > 0 && missing.length === 0) {
    await writeStandings(official.map(officialRow));
  } else {
    if (official.length > 0) {
      classementNote = `Classement FFBB incomplet (${pouleTeams.size - missing.length} équipe(s) sur ${pouleTeams.size}) : recalculé à partir des matchs.`;
    }
    const recalcul = await computeClassementCore(supabase, phase.id);
    if (recalcul?.error) {
      // Pas encore de match joué (début de saison) : classement FFBB complété par les équipes manquantes, à zéro.
      if (official.length > 0) {
        const base = official.map(officialRow);
        const extra = missing.map((id, i) => ({
          ...officialRow({ idEngagement: { id, nom: pouleTeams.get(id) }, position: base.length + i + 1, points: 0, matchJoues: 0, gagnes: 0, perdus: 0 }),
        }));
        await writeStandings([...base, ...extra]);
        classementNote = `Classement FFBB complété avec ${missing.length} équipe(s) manquante(s).`;
      } else {
        classementNote = `Classement non calculé : ${recalcul.error}`;
      }
    }
  }

  // Statut de la phase.
  const when = new Date(fetchedAt).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  await supabase
    .from("basketball_phases")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_error: [`Données du cache FFBB du ${when}.`, classementNote].filter(Boolean).join(" "),
    })
    .eq("id", phase.id);

  return { name, label: ident.label, phaseName: phase.phase_name, matches: toWrite.length, archived };
}

// ---- Import des statistiques TeamStats -------------------------------------
// TeamStats (appli séparée, même base) saisit la feuille de match en direct
// (temps de jeu, tirs, rebonds... par quart-temps) et la range dans
// stats_matches / stats_player_game_stats / stats_player_period_stats, liée
// à NOTRE match via l'ID FFBB de la rencontre (basketball_matches.ffbb_rencontre_id
// = stats_matches.ffbb_match_id). Cette action rapatrie ces statistiques dans
// Multisports (basketball_match_stats + basketball_match_period_stats), et
// rattache (en MERGE, jamais en remplacement) les joueuses reconnues à
// l'effectif de l'équipe et à basketball_team pour la phase du match.
//
// Le nom TeamStats ("LAURA B.", "CHLOE"...) est notre seule clé pour
// retrouver la fiche joueuse : voir lib/teamstats.js pour la convention et
// l'algorithme de rapprochement (roster de la phase en priorité, puis reste
// de l'effectif, jamais de fiche choisie au hasard en cas d'ambiguïté).
export async function checkTeamStatsAvailability(matchId) {
  const supabase = createClient();
  const { data: match } = await supabase
    .from("basketball_matches")
    .select("ffbb_rencontre_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match?.ffbb_rencontre_id) return null;

  const { data: statsMatch } = await supabase
    .from("stats_matches")
    .select("id, team_home, team_away, score_home, score_away, period_count")
    .eq("ffbb_match_id", match.ffbb_rencontre_id)
    .maybeSingle();
  if (!statsMatch) return null;

  const { count } = await supabase
    .from("stats_player_game_stats")
    .select("id", { count: "exact", head: true })
    .eq("match_id", statsMatch.id);

  const { count: quartersCount } = await supabase
    .from("stats_match_events")
    .select("id", { count: "exact", head: true })
    .eq("match_id", statsMatch.id)
    .like("action_type", "ETAT:SCORE_PERIODE:%");

  return {
    quartersCount: quartersCount ?? 0,
    teamHome: statsMatch.team_home,
    teamAway: statsMatch.team_away,
    scoreHome: statsMatch.score_home,
    scoreAway: statsMatch.score_away,
    periodCount: statsMatch.period_count,
    playerCount: count ?? 0,
  };
}

export async function importMatchStatsFromTeamStats(matchId) {
  const { findPlayerForTeamStatsName, secondsToMinutes } = await import("@/lib/teamstats");
  const supabase = createClient();

  const { data: match } = await supabase.from("basketball_matches").select("*").eq("id", matchId).maybeSingle();
  if (!match) throw new Error("Ce match n'existe plus.");
  if (!isCurrentSeason(match.season)) throw new Error("Import impossible : cette saison est archivée.");
  if (!match.ffbb_rencontre_id) throw new Error("Ce match n'a pas d'ID FFBB : rien à retrouver dans TeamStats.");

  const { data: statsMatch } = await supabase
    .from("stats_matches")
    .select("id")
    .eq("ffbb_match_id", match.ffbb_rencontre_id)
    .maybeSingle();
  if (!statsMatch) throw new Error("Aucune saisie TeamStats trouvée pour ce match.");

  const [
    { data: totals },
    { data: periodRows },
    { data: phase },
    { data: allPlayers },
    { data: rosterRows },
    { data: scoreEvents },
  ] =
    await Promise.all([
      supabase.from("stats_player_game_stats").select("*").eq("match_id", statsMatch.id),
      supabase.from("stats_player_period_stats").select("*").eq("match_id", statsMatch.id),
      match.phase_id
        ? supabase.from("basketball_phases").select("season, ffbb_engagement_id, poule_id").eq("id", match.phase_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("basketball_players").select("*").eq("participant_sport_id", match.participant_sport_id),
      match.phase_id
        ? supabase.from("basketball_team").select("player_id").eq("phase_id", match.phase_id)
        : Promise.resolve({ data: [] }),
      // Score de chaque quart-temps : TeamStats l'enregistre sous forme d'événements
      // « ETAT:SCORE_PERIODE:<domicile>-<extérieur> » (points marqués DANS la période).
      supabase
        .from("stats_match_events")
        .select("period, action_type")
        .eq("match_id", statsMatch.id)
        .like("action_type", "ETAT:SCORE_PERIODE:%"),
    ]);

  if (!totals || totals.length === 0) throw new Error("La saisie TeamStats de ce match est vide.");

  const players = [...(allPlayers ?? [])];
  const rosterIds = new Set((rosterRows ?? []).map((r) => r.player_id));
  const usedIds = new Set();
  const created = [];
  const ambiguous = [];
  const resolvedByName = new Map(); // nom TeamStats -> player_id

  for (const row of totals) {
    const found = findPlayerForTeamStatsName(row.player_name, players, rosterIds, usedIds);
    if (found.kind === "ambiguous") {
      ambiguous.push(row.player_name);
      continue;
    }
    let player = found.player;
    if (found.kind === "new") {
      const first = found.parsed.first.toUpperCase();
      const last = (found.parsed.last || "INCONNU").toUpperCase();
      const { data: inserted, error } = await supabase
        .from("basketball_players")
        .insert({
          participant_sport_id: match.participant_sport_id,
          role: "joueur",
          name: `${first} ${last}`,
          first_name: first,
          last_name: last,
          jersey_number: row.player_number ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(`Création de la fiche pour "${row.player_name}" : ${error.message}`);
      player = inserted;
      players.push(player);
      created.push(row.player_name);
    }
    usedIds.add(player.id);
    resolvedByName.set(row.player_name, player.id);

    // MERGE dans l'effectif de la phase : on ajoute le lien s'il manque,
    // sans jamais toucher aux joueuses déjà rattachées.
    if (match.phase_id) {
      await supabase.from("basketball_team").upsert(
        {
          player_id: player.id,
          phase_id: match.phase_id,
          season: phase?.season ?? match.season,
          ffbb_engagement_id: phase?.ffbb_engagement_id ?? null,
          ffbb_poule_id: phase?.poule_id ?? null,
        },
        { onConflict: "player_id,phase_id" }
      );
    }
  }

  if (resolvedByName.size === 0) {
    throw new Error("Aucune joueuse TeamStats n'a pu être reconnue — import annulé.");
  }

  // Remplace entièrement les stats de CE match (c'est le sens de la
  // confirmation demandée à l'utilisateur avant l'import).
  await supabase.from("basketball_match_stats").delete().eq("match_id", matchId);
  await supabase.from("basketball_match_period_stats").delete().eq("match_id", matchId);

  const statsRows = totals
    .filter((row) => resolvedByName.has(row.player_name))
    .map((row) => {
      const playerId = resolvedByName.get(row.player_name);
      const isStarter = (periodRows ?? []).some(
        (p) => p.player_name === row.player_name && p.period === 1 && p.is_starter
      );
      return {
        match_id: matchId,
        player_id: playerId,
        jersey_number_match: row.player_number ?? null,
        fouls: row.fouls ?? 0,
        fouls_drawn: row.fouls_drawn ?? 0,
        ft_made: row.ft_made ?? 0,
        ft_att: row.ft_att ?? 0,
        two_made: row.pts2_made ?? 0,
        two_att: row.pts2_att ?? 0,
        three_made: row.pts3_made ?? 0,
        three_att: row.pts3_att ?? 0,
        reb_off: row.reb_off ?? 0,
        reb_def: row.reb_def ?? 0,
        assists: row.assists ?? 0,
        is_starting_five: isStarter,
        on_sheet: true,
        minutes_played: secondsToMinutes(row.playing_time_seconds),
        updated_at: new Date().toISOString(),
      };
    });
  const { error: statsErr } = await supabase.from("basketball_match_stats").insert(statsRows);
  if (statsErr) throw new Error(`Enregistrement des statistiques : ${statsErr.message}`);

  const periodStatsRows = (periodRows ?? [])
    .filter((row) => resolvedByName.has(row.player_name))
    .map((row) => ({
      match_id: matchId,
      player_id: resolvedByName.get(row.player_name),
      period: row.period,
      is_starter: row.is_starter ?? false,
      playing_time_seconds: row.playing_time_seconds ?? 0,
      points: row.points ?? 0,
      pts2_made: row.pts2_made ?? 0,
      pts2_att: row.pts2_att ?? 0,
      pts3_made: row.pts3_made ?? 0,
      pts3_att: row.pts3_att ?? 0,
      ft_made: row.ft_made ?? 0,
      ft_att: row.ft_att ?? 0,
      reb_off: row.reb_off ?? 0,
      reb_def: row.reb_def ?? 0,
      assists: row.assists ?? 0,
      fouls: row.fouls ?? 0,
      fouls_drawn: row.fouls_drawn ?? 0,
    }));
  if (periodStatsRows.length > 0) {
    const { error: periodErr } = await supabase.from("basketball_match_period_stats").insert(periodStatsRows);
    if (periodErr) throw new Error(`Enregistrement du détail par quart-temps : ${periodErr.message}`);
  }

  // La feuille de match affiche par défaut TOUTES les joueuses de la fiche (seul on_sheet=false les
  // en retire). On ne garde donc que celles de TeamStats : toutes les autres sont marquées « absentes »
  // pour CE match uniquement — elles restent dans l'effectif et gardent leurs stats des autres matchs.
  const importedIds = new Set(resolvedByName.values());
  const absentRows = players
    .filter((p) => p.role !== "entraineur" && !importedIds.has(p.id))
    .map((p) => ({ match_id: matchId, player_id: p.id, on_sheet: false, updated_at: new Date().toISOString() }));
  if (absentRows.length > 0) {
    const { error: absentErr } = await supabase
      .from("basketball_match_stats")
      .upsert(absentRows, { onConflict: "match_id,player_id" });
    if (absentErr) throw new Error(`Mise à jour de la feuille de match : ${absentErr.message}`);
  }

  // Scores par quart-temps (côté « nous » / « adversaire »). TeamStats stocke domicile/extérieur
  // au sens strict ; dans MULTISPORTS l'équipe 1 est le domicile. Le score officiel FFBB n'est jamais touché.
  const quarters = Array.from({ length: 8 }, () => ({ us: null, them: null }));
  let quartersImported = 0;
  if (typeof match.us_is_team1 === "boolean") {
    for (const ev of scoreEvents ?? []) {
      const m = /^ETAT:SCORE_PERIODE:(\d+)-(\d+)$/.exec(ev.action_type ?? "");
      const idx = Number(ev.period) - 1;
      if (!m || !(idx >= 0 && idx < quarters.length)) continue;
      const home = Number(m[1]);
      const away = Number(m[2]);
      quarters[idx] = match.us_is_team1 ? { us: home, them: away } : { us: away, them: home };
      quartersImported += 1;
    }
  }
  if (quartersImported > 0) {
    const { error: reportErr } = await supabase
      .from("basketball_matches")
      .update({ match_report: { quarters, notes: match.match_report?.notes ?? null } })
      .eq("id", matchId);
    if (reportErr) throw new Error(`Enregistrement des scores par quart-temps : ${reportErr.message}`);
  }

  revalidatePath("/basket");

  return {
    imported: resolvedByName.size,
    created,
    ambiguous,
    removedFromSheet: absentRows.length,
    quartersImported,
  };
}

// ---------------------------------------------------------------------------
// Classement CALCULÉ par l'appli, à partir des matchs enregistrés dans la phase.
// Sert quand la synchro FFBB est indisponible (saisie manuelle des résultats).
// Barème automatique : compétition U11 = victoire 3, nul 2, défaite 1 (vérifié sur le classement
// officiel d'une poule U11) ; toute autre catégorie = victoire 2, défaite 1. Départage des égalités
// (approximation du règlement) : confrontations directes (points, puis différence), puis différence
// générale, puis points marqués. Les forfaits (0 pt) et pénalités ne sont pas connus : à comparer au site.
// Une prochaine synchro FFBB réussie remplace ce classement par le classement officiel.
// ---------------------------------------------------------------------------
function teamKey(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CLASSEMENT_SCORING = {
  "21": { win: 2, draw: 1, loss: 1 },
  "321": { win: 3, draw: 2, loss: 1 },
};

export async function computeClassement(phaseId) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  return computeClassementCore(supabase, phaseId);
}

// Cœur du calcul, aussi appelé à la fin d'une synchro FFBB (applyPouleToParticipant).
// Les équipes « EXEMPT » (poule impaire : une équipe se repose) ne figurent pas au classement.
async function computeClassementCore(supabase, phaseId) {
  const { data: phase, error: phaseError } = await supabase
    .from("basketball_phases")
    .select("id, participant_sport_id, season, poule_id")
    .eq("id", phaseId)
    .single();
  if (phaseError || !phase) return { error: "Phase introuvable." };

  const { data: matches, error: matchError } = await supabase
    .from("basketball_matches")
    .select(
      "id, team1_name, team2_name, team1_engagement_id, team2_engagement_id, team1_score, team2_score, status, us_is_team1, poule_id, division_label"
    )
    .eq("phase_id", phaseId);
  if (matchError) return { error: matchError.message };

  // Barème : U11 (d'après le nom de la compétition) = 3-2-1, sinon 2-1.
  const scoringText = (matches ?? []).map((m) => m.division_label).filter(Boolean).join(" ");
  const rule = CLASSEMENT_SCORING[/\bU\s?11\b/i.test(scoringText) ? "321" : "21"];

  // 1. Les équipes de la poule (une entrée par nom d'équipe).
  const teams = new Map();
  const addTeam = (name, id) => {
    const key = teamKey(name);
    if (!key || key === "exempt") return;
    const known = teams.get(key);
    if (!known) teams.set(key, { key, name: String(name).trim(), id: id ? String(id) : null });
    else if (!known.id && id) known.id = String(id);
  };
  for (const m of matches ?? []) {
    addTeam(m.team1_name, m.team1_engagement_id);
    addTeam(m.team2_name, m.team2_engagement_id);
  }
  if (teams.size < 3) {
    return {
      error:
        "Il faut les matchs de TOUTE la poule pour calculer un classement (ici, seulement " +
        `${teams.size} équipe(s) trouvée(s)).`,
    };
  }
  // Équipe sans identifiant FFBB (saisie manuelle) : identifiant interne stable.
  for (const t of teams.values()) if (!t.id) t.id = `manuel:${t.key}`;

  // 2. On renseigne l'identifiant des équipes sur les matchs qui n'en ont pas
  //    (l'onglet Classement s'en sert pour les points marqués/encaissés, la forme et les écussons).
  for (const m of matches ?? []) {
    const id1 = teams.get(teamKey(m.team1_name))?.id;
    const id2 = teams.get(teamKey(m.team2_name))?.id;
    const patch = {};
    if (id1 && !m.team1_engagement_id) patch.team1_engagement_id = id1;
    if (id2 && !m.team2_engagement_id) patch.team2_engagement_id = id2;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("basketball_matches").update(patch).eq("id", m.id);
      if (error) return { error: `Mise à jour d'un match impossible (${error.message}).` };
    }
  }

  // 3. Statistiques à partir des matchs joués.
  const played = (matches ?? []).filter(
    (m) => m.status === "joue" && m.team1_score != null && m.team2_score != null
  );
  if (played.length === 0) return { error: "Aucun match joué avec un score dans cette phase." };

  const stats = new Map([...teams.values()].map((t) => [t.key, { ...t, j: 0, g: 0, p: 0, n: 0, pts: 0, bp: 0, bc: 0 }]));
  for (const m of played) {
    const a = stats.get(teamKey(m.team1_name));
    const b = stats.get(teamKey(m.team2_name));
    if (!a || !b) continue;
    a.j += 1;
    b.j += 1;
    a.bp += m.team1_score;
    a.bc += m.team2_score;
    b.bp += m.team2_score;
    b.bc += m.team1_score;
    if (m.team1_score > m.team2_score) {
      a.g += 1; a.pts += rule.win; b.p += 1; b.pts += rule.loss;
    } else if (m.team1_score < m.team2_score) {
      b.g += 1; b.pts += rule.win; a.p += 1; a.pts += rule.loss;
    } else {
      a.n += 1; b.n += 1; a.pts += rule.draw; b.pts += rule.draw; // match nul (possible en U11)
    }
  }

  // 4. Classement : points, puis départage des égalités.
  const byPoints = new Map();
  for (const r of stats.values()) {
    if (!byPoints.has(r.pts)) byPoints.set(r.pts, []);
    byPoints.get(r.pts).push(r);
  }
  const ranked = [];
  for (const pts of [...byPoints.keys()].sort((x, y) => y - x)) {
    const group = byPoints.get(pts);
    if (group.length > 1) {
      const keys = new Set(group.map((r) => r.key));
      const h2h = new Map(group.map((r) => [r.key, { pts: 0, diff: 0 }]));
      for (const m of played) {
        const k1 = teamKey(m.team1_name);
        const k2 = teamKey(m.team2_name);
        if (!keys.has(k1) || !keys.has(k2)) continue;
        const d = m.team1_score - m.team2_score;
        h2h.get(k1).diff += d;
        h2h.get(k2).diff -= d;
        h2h.get(k1).pts += d > 0 ? rule.win : d < 0 ? rule.loss : rule.draw;
        h2h.get(k2).pts += d < 0 ? rule.win : d > 0 ? rule.loss : rule.draw;
      }
      group.sort(
        (a, b) =>
          h2h.get(b.key).pts - h2h.get(a.key).pts ||
          h2h.get(b.key).diff - h2h.get(a.key).diff ||
          b.bp - b.bc - (a.bp - a.bc) ||
          b.bp - a.bp ||
          a.name.localeCompare(b.name, "fr")
      );
    }
    ranked.push(...group);
  }

  // 5. Notre équipe = celle des matchs marqués « nous ».
  const ours = (matches ?? []).find((m) => m.us_is_team1 !== null && m.us_is_team1 !== undefined);
  const ourKey = ours ? teamKey(ours.us_is_team1 ? ours.team1_name : ours.team2_name) : null;

  const pouleId = phase.poule_id ?? (matches ?? []).find((m) => m.poule_id)?.poule_id ?? null;
  const now = new Date().toISOString();
  const rows = ranked.map((r, index) => ({
    participant_sport_id: phase.participant_sport_id,
    phase_id: phaseId,
    poule_id: pouleId,
    season: phase.season,
    engagement_id: r.id,
    engagement_nom: r.name,
    position: index + 1,
    points: r.pts,
    matches_joues: r.j,
    gagnes: r.g,
    perdus: r.p,
    is_us: r.key === ourKey,
    synced_at: now,
  }));

  // 6. Remplacement du classement de cette phase (avec retour en arrière si l'écriture échoue).
  const { data: previous } = await supabase.from("basketball_classements").select("*").eq("phase_id", phaseId);
  const { error: delError } = await supabase.from("basketball_classements").delete().eq("phase_id", phaseId);
  if (delError) return { error: `Nettoyage de l'ancien classement impossible (${delError.message}).` };
  const { error: insError } = await supabase.from("basketball_classements").insert(rows);
  if (insError) {
    if (previous?.length) await supabase.from("basketball_classements").insert(previous);
    return { error: `Écriture du classement impossible (${insError.message}).` };
  }

  revalidatePath("/basket");
  return {
    ok: true,
    message: `Classement calculé (victoire ${rule.win}, nul ${rule.draw}, défaite ${rule.loss}) : ${ranked.length} équipes, ${played.length} matchs joués.`,
  };
}
