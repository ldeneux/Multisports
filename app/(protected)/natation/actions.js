"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const FFN_USER_AGENT = "Mozilla/5.0 (compatible; SportFamilleApp/1.0)";

// ---- Table officielle des codes d'épreuve (raceid), spec FFNex v1.0.19 ----
// Trois tables séparées par genre : les mêmes codes existent en double
// (Dames/Messieurs/Mixte) pour une même distance/nage, donc il faut garder
// le genre pour ne pas mélanger les classements des filles et des garçons.
const DAMES_RACES = {
  "100": "25 Nage Libre", "1": "50 Nage Libre", "2": "100 Nage Libre", "3": "200 Nage Libre",
  "4": "400 Nage Libre", "5": "800 Nage Libre", "7": "1000 Nage Libre", "6": "1500 Nage Libre",
  "16": "3000 Nage Libre", "15": "5000 Nage Libre",
  "110": "25 Dos", "11": "50 Dos", "12": "100 Dos", "13": "200 Dos",
  "120": "25 Brasse", "21": "50 Brasse", "22": "100 Brasse", "23": "200 Brasse",
  "130": "25 Papillon", "31": "50 Papillon", "32": "100 Papillon", "33": "200 Papillon",
  "40": "100 4 Nages", "41": "200 4 Nages", "42": "400 4 Nages",
  "8": "4x25 Nage Libre", "47": "4x50 Nage Libre", "43": "4x100 Nage Libre", "44": "4x200 Nage Libre",
  "111": "4x50 Dos", "121": "4x50 Brasse", "131": "4x50 Papillon",
  "39": "4x25 4 Nages", "48": "4x50 4 Nages", "46": "4x100 4 Nages", "49": "6x50 Nage Libre",
  "14": "8x100 Nage Libre", "9": "10x50 Nage Libre", "45": "10x100 Nage Libre",
};

const MESSIEURS_RACES = {
  "150": "25 Nage Libre", "51": "50 Nage Libre", "52": "100 Nage Libre", "53": "200 Nage Libre",
  "54": "400 Nage Libre", "55": "800 Nage Libre", "57": "1000 Nage Libre", "56": "1500 Nage Libre",
  "66": "3000 Nage Libre", "65": "5000 Nage Libre",
  "160": "25 Dos", "61": "50 Dos", "62": "100 Dos", "63": "200 Dos",
  "170": "25 Brasse", "71": "50 Brasse", "72": "100 Brasse", "73": "200 Brasse",
  "180": "25 Papillon", "81": "50 Papillon", "82": "100 Papillon", "83": "200 Papillon",
  "90": "100 4 Nages", "91": "200 4 Nages", "92": "400 4 Nages",
  "58": "4x25 Nage Libre", "97": "4x50 Nage Libre", "93": "4x100 Nage Libre", "94": "4x200 Nage Libre",
  "161": "4x50 Dos", "171": "4x50 Brasse", "181": "4x50 Papillon",
  "89": "4x25 4 Nages", "98": "4x50 4 Nages", "96": "4x100 4 Nages", "99": "6x50 Nage Libre",
  "64": "8x100 Nage Libre", "59": "10x50 Nage Libre", "95": "10x100 Nage Libre",
};

const MIXTE_RACES = {
  "200": "25 Nage Libre", "201": "50 Nage Libre", "202": "100 Nage Libre", "203": "200 Nage Libre",
  "204": "400 Nage Libre", "205": "800 Nage Libre", "207": "1000 Nage Libre", "206": "1500 Nage Libre",
  "216": "3000 Nage Libre", "215": "5000 Nage Libre",
  "210": "25 Dos", "211": "50 Dos", "212": "100 Dos", "213": "200 Dos",
  "220": "25 Brasse", "221": "50 Brasse", "222": "100 Brasse", "223": "200 Brasse",
  "230": "25 Papillon", "231": "50 Papillon", "232": "100 Papillon", "233": "200 Papillon",
  "240": "100 4 Nages", "241": "200 4 Nages", "242": "400 4 Nages",
  "86": "4x25 Nage Libre", "87": "4x50 Nage Libre", "88": "4x100 Nage Libre", "34": "4x200 Nage Libre",
  "38": "4x25 4 Nages", "37": "4x50 4 Nages", "36": "4x100 4 Nages", "35": "6x50 Nage Libre",
  "214": "8x100 Nage Libre", "84": "10x50 Nage Libre", "85": "10x100 Nage Libre",
};

function resolveRace(raceId) {
  if (DAMES_RACES[raceId]) return { eventName: DAMES_RACES[raceId], gender: "F" };
  if (MESSIEURS_RACES[raceId]) return { eventName: MESSIEURS_RACES[raceId], gender: "M" };
  if (MIXTE_RACES[raceId]) return { eventName: MIXTE_RACES[raceId], gender: "X" };
  return { eventName: `Épreuve ${raceId}`, gender: null };
}

const DQ_LABELS = {
  "1": "Forfait excusé", "2": "Forfait déclaré", "3": "Disqualifié (relais)", "4": "Forfait",
  "6": "Disqualifié", "7": "Faux départ", "8": "Virage incorrect", "9": "Nage incorrecte",
  "10": "Disqualifié", "52": "Temps limite dépassé", "53": "Non courue",
  "54": "Arrivée incorrecte", "55": "Abandon",
};

const STROKE_PATTERNS = [
  { key: "papillon", label: "Papillon" },
  { key: "dos", label: "Dos" },
  { key: "brasse", label: "Brasse" },
  { key: "4 nages", label: "4 Nages" },
  { key: "nage libre", label: "Nage libre" },
];

// "50 Dos" -> { distance_m: 50, stroke: "Dos" } (les épreuves de relais type
// "4x50 Nage Libre" ne sont pas découpées ici, elles sont filtrées avant).
function parseEvent(eventName) {
  const match = eventName.match(/^(\d+)\s*(.+)$/);
  if (!match) return { distance_m: null, stroke: eventName };
  const distance_m = parseInt(match[1], 10);
  const rest = match[2].trim().toLowerCase();
  const found = STROKE_PATTERNS.find((s) => rest.includes(s.key));
  return { distance_m, stroke: found ? found.label : match[2].trim() };
}

// Format officiel FFNex : "m.sscc" (ex. "1.2345" = 1 min 23 s 45), ou
// "hh`h`mm.sscc" si des heures sont présentes (jamais le cas en natation
// course). Spec FFNex §3.1.
function parseSwimtimeAttr(str) {
  if (!str) return null;
  const s = str.trim();
  if (s === "" || s === "0") return null;
  const withHours = s.match(/^(-?\d+)h(\d{2})\.(\d{2})(\d{2})$/);
  if (withHours) {
    const [, h, m, sec, cs] = withHours;
    return (parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(sec, 10)) * 1000 + parseInt(cs, 10) * 10;
  }
  const match = s.match(/^(-?\d+)\.(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, m, sec, cs] = match;
  return (parseInt(m, 10) * 60 + parseInt(sec, 10)) * 1000 + parseInt(cs, 10) * 10;
}

// Supabase-js ne lève pas d'exception sur une erreur de requête : il faut
// vérifier { error } explicitement, sinon un échec passe inaperçu.
function assertNoError(step, error) {
  if (error) throw new Error(`${step} : ${error.message}`);
}

// ---- Config club + synchro -------------------------------------------------
// 1) Liste des compétitions du club/de la saison : page HTML publique
//    (competitions.php), parsée par fenêtre de texte.
// 2) Résultats de chaque compétition départementale : export officiel FFNex
//    (XML), beaucoup plus fiable — nom d'épreuve, ID FFN de chaque nageur,
//    temps exact, tout y est structuré.

export async function syncClubCompetitions(formData) {
  const supabase = createClient();
  const participantSportId = formData.get("participant_sport_id");
  const clubId = (formData.get("ffn_club_id") || "").trim();
  const seasonYear = (formData.get("season_year") || "").trim();

  if (!clubId || !seasonYear) {
    await supabase
      .from("participant_sports")
      .update({
        ffn_club_id: clubId || null,
        last_ffn_sync_at: new Date().toISOString(),
        last_ffn_sync_error: "ID club FFN et saison sont requis.",
        last_ffn_sync_summary: null,
      })
      .eq("id", participantSportId);
    revalidatePath("/natation");
    return;
  }

  await supabase
    .from("participant_sports")
    .update({ ffn_club_id: clubId })
    .eq("id", participantSportId);

  let competitionsFound = 0;
  let competitionsOk = 0;
  let competitionsFailed = [];
  let resultsWritten = 0;

  try {
    const cheerio = await import("cheerio");

    const listUrl = `https://ffn.extranat.fr/webffn/competitions.php?idact=nat&idrch=str|${encodeURIComponent(clubId)}&idann=${encodeURIComponent(seasonYear)}`;
    const listRes = await fetch(listUrl, {
      headers: { "User-Agent": FFN_USER_AGENT },
      cache: "no-store",
    });
    if (!listRes.ok) throw new Error(`Page compétitions inaccessible (HTTP ${listRes.status}).`);
    const listHtml = await listRes.text();

    const linkPattern = /<a[^>]*href="[^"]*resultats\.php\?idact=nat&idcpt=(\d+)"[^>]*>([^<]+)<\/a>/g;
    const competitionsMap = {};
    let match;
    while ((match = linkPattern.exec(listHtml)) !== null) {
      const idcpt = match[1];
      const name = match[2].trim();
      const before = listHtml.slice(Math.max(0, match.index - 900), match.index);
      if (!/D[ée]partemental/.test(before)) continue;
      competitionsMap[idcpt] = { idcpt, name };
    }

    const competitions = Object.values(competitionsMap);
    competitionsFound = competitions.length;

    if (competitions.length === 0) {
      throw new Error(
        "Aucune compétition départementale trouvée pour cet ID club / cette saison — vérifie les deux valeurs."
      );
    }

    for (const comp of competitions) {
      const xmlUrl = `https://ffn.extranat.fr/webffn/resultats_ffnex.php?idcpt=${comp.idcpt}`;
      const xmlRes = await fetch(xmlUrl, {
        headers: { "User-Agent": FFN_USER_AGENT, Accept: "application/xml,text/xml" },
        cache: "no-store",
      });
      if (!xmlRes.ok) {
        competitionsFailed.push(`${comp.name} (HTTP ${xmlRes.status})`);
        continue; // une compétition en erreur ne bloque pas les autres
      }

      const xml = await xmlRes.text();

      if (!xml.includes("<MEET")) {
        competitionsFailed.push(`${comp.name} (réponse inattendue — pas de XML)`);
        continue;
      }

      const $ = cheerio.load(xml, { xmlMode: true });

      const meetEl = $("MEET").first();
      if (meetEl.length === 0) {
        competitionsFailed.push(`${comp.name} (balise MEET introuvable)`);
        continue;
      }

      competitionsOk += 1;

      const poolLength = parseInt($("POOL").attr("size") || "25", 10);
      const meetName = meetEl.attr("name") || comp.name;
      const meetCity = meetEl.attr("city") || null;
      const meetDate = meetEl.attr("startdate") || null;

      const { data: compRow, error: compError } = await supabase
        .from("swim_competitions")
        .upsert(
          {
            ffn_competition_id: comp.idcpt,
            name: meetName,
            city: meetCity,
            level: "Départemental",
            pool_length: poolLength,
            competition_date: meetDate,
            season_year: Number(seasonYear),
            synced_at: new Date().toISOString(),
          },
          { onConflict: "ffn_competition_id" }
        )
        .select()
        .single();
      if (compError) throw new Error(`Écriture compétition impossible (${compError.message}).`);

      const clubsById = {};
      $("CLUB").each((_, el) => {
        const $el = $(el);
        clubsById[$el.attr("id")] = $el.attr("name");
      });

      const swimmersById = {};
      $("SWIMMER").each((_, el) => {
        const $el = $(el);
        const id = $el.attr("id");
        const birthdate = $el.attr("birthdate");
        swimmersById[id] = {
          ffn_swimmer_id: id,
          full_name: `${$el.attr("firstname") || ""} ${$el.attr("lastname") || ""}`.trim(),
          club: clubsById[$el.attr("clubid")] || null,
          ffn_club_id: $el.attr("clubid") || null,
          birth_year: birthdate ? parseInt(birthdate.slice(0, 4), 10) : null,
        };
      });

      const resultRows = [];
      $("RESULT").each((_, el) => {
        const $el = $(el);
        const solo = $el.children("SOLO").first();
        if (solo.length === 0) return; // relais non capturés pour l'instant

        const swimmerId = solo.attr("swimmerid");
        if (!swimmerId || !swimmersById[swimmerId]) return;

        const raceId = $el.attr("raceid");
        const { eventName, gender } = resolveRace(raceId);
        const disqId = $el.attr("disqualificationid");
        const time_ms = parseSwimtimeAttr($el.attr("swimtime"));
        const pointsAttr = $el.attr("points");

        resultRows.push({
          ffnResultId: $el.attr("id"),
          swimmerId,
          eventName,
          gender,
          time_ms,
          time_label: time_ms === null ? (DQ_LABELS[disqId] || (disqId ? "Disqualifié" : null)) : null,
          place: $el.attr("place") && $el.attr("place") !== "999" ? $el.attr("place") : null,
          points: pointsAttr ? parseInt(pointsAttr, 10) : null,
        });
      });

      // Écritures en LOT plutôt qu'une par une : avec ~100-150 résultats par
      // compétition, faire un aller-retour base de données par ligne prenait
      // largement plus de temps que la limite d'exécution d'une fonction
      // serveur Vercel, et le bouton restait grisé indéfiniment sans jamais
      // aboutir.
      const swimmerPayload = Object.values(swimmersById);
      let swimmerUuidByFfnId = {};
      if (swimmerPayload.length > 0) {
        const { data: upsertedSwimmers, error: swimmersError } = await supabase
          .from("swimmers")
          .upsert(swimmerPayload, { onConflict: "ffn_swimmer_id" })
          .select();
        if (swimmersError) throw new Error(`Écriture nageurs impossible (${swimmersError.message}).`);
        (upsertedSwimmers ?? []).forEach((s) => {
          swimmerUuidByFfnId[s.ffn_swimmer_id] = s.id;
        });
      }

      const resultPayload = resultRows
        .map((row) => {
          const swimmerUuid = swimmerUuidByFfnId[row.swimmerId];
          if (!swimmerUuid) return null;
          const { distance_m, stroke } = parseEvent(row.eventName);
          return {
            competition_id: compRow.id,
            swimmer_id: swimmerUuid,
            ffn_result_id: row.ffnResultId,
            event_name: row.eventName,
            gender: row.gender,
            stroke,
            distance_m,
            pool_length: poolLength,
            rank: row.place,
            time_ms: row.time_ms,
            time_label: row.time_label,
            points: row.points,
          };
        })
        .filter(Boolean);

      if (resultPayload.length > 0) {
        const { error: resultsError } = await supabase
          .from("swim_results")
          .upsert(resultPayload, { onConflict: "competition_id,ffn_result_id" });
        if (resultsError) {
          throw new Error(
            `Écriture résultats impossible (${resultsError.message}). As-tu bien joué le script 9-natation-ffnex.sql ?`
          );
        }
        resultsWritten += resultPayload.length;
      }
    }

    const { data: allPs } = await supabase
      .from("participant_sports")
      .select("participant_id, ffn_swimmer_id")
      .not("ffn_swimmer_id", "is", null);

    for (const ps of allPs ?? []) {
      await supabase
        .from("swimmers")
        .update({ participant_id: ps.participant_id })
        .eq("ffn_swimmer_id", ps.ffn_swimmer_id);
    }

    const summary =
      `${competitionsFound} compétition(s) trouvée(s), ${competitionsOk} lue(s), ${resultsWritten} résultat(s).` +
      (competitionsFailed.length > 0
        ? ` Échecs : ${competitionsFailed.slice(0, 5).join(" · ")}${competitionsFailed.length > 5 ? "…" : ""}`
        : "");

    await supabase
      .from("participant_sports")
      .update({
        last_ffn_sync_at: new Date().toISOString(),
        last_ffn_sync_error: null,
        last_ffn_sync_summary: summary.slice(0, 500),
      })
      .eq("id", participantSportId);
  } catch (err) {
    await supabase
      .from("participant_sports")
      .update({
        last_ffn_sync_at: new Date().toISOString(),
        last_ffn_sync_error: String(err?.message || err).slice(0, 300),
      })
      .eq("id", participantSportId);
  }

  revalidatePath("/natation");
}

// ---- Nageurs : lien vers un participant + flag "à suivre" -----------------

export async function linkSwimmerToParticipant(formData) {
  const supabase = createClient();
  const swimmerId = formData.get("swimmer_id");
  const participantId = formData.get("participant_id") || null;

  const { error } = await supabase
    .from("swimmers")
    .update({ participant_id: participantId })
    .eq("id", swimmerId);
  assertNoError("Association au participant", error);

  revalidatePath("/natation");
}

export async function toggleSwimmerFlag(formData) {
  const supabase = createClient();
  const swimmerId = formData.get("swimmer_id");
  const currentlyFlagged = formData.get("currently_flagged") === "true";

  const { error } = await supabase
    .from("swimmers")
    .update({ is_flagged: !currentlyFlagged })
    .eq("id", swimmerId);
  assertNoError("Mise à jour du flag", error);

  revalidatePath("/natation");
}
