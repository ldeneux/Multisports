"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { swimTimeToMs } from "@/lib/utils";

const FFN_USER_AGENT = "Mozilla/5.0 (compatible; SportFamilleApp/1.0)";

const STROKE_PATTERNS = [
  { key: "papillon", label: "Papillon" },
  { key: "dos", label: "Dos" },
  { key: "brasse", label: "Brasse" },
  { key: "4 nages", label: "4 Nages" },
  { key: "4n", label: "4 Nages" },
  { key: "nage libre", label: "Nage libre" },
  { key: "nl", label: "Nage libre" },
];

// ---- Reconnaissance de colonnes par contenu (plutôt que par position) -----

function looksLikeEvent(text) {
  if (!/^\d/.test(text)) return false;
  const lower = text.toLowerCase();
  return STROKE_PATTERNS.some((s) => lower.includes(s.key));
}
function looksLikeTime(text) {
  return /^\d{1,2}:\d{2}[.,]\d{1,2}$/.test(text) || /^\d{1,2}[.,]\d{1,2}$/.test(text);
}
function looksLikeAge(text) {
  return /^\(\d+\s*ans\)$/i.test(text);
}
function looksLikePoints(text) {
  return /^\d+\s*pts$/i.test(text);
}
function looksLikeDate(text) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(text);
}
function looksLikeLevel(text) {
  return /^\[(INT|NAT|ZON|REG|DEP)\]$/i.test(text);
}

function parseEvent(eventName) {
  const match = eventName.match(/^(\d+)\s*(.+)$/);
  if (!match) return { distance_m: null, stroke: eventName.trim() };
  const distance_m = parseInt(match[1], 10);
  const rest = match[2].trim().toLowerCase();
  const found = STROKE_PATTERNS.find((s) => rest.includes(s.key));
  return { distance_m, stroke: found ? found.label : match[2].trim() };
}

function parseFfnTime(text) {
  if (!text) return null;
  const cleaned = text.trim().replace(/^00:(?=\d{1,2}:)/, "");
  return swimTimeToMs(cleaned);
}

function extractResultLink($, tr) {
  const href = $(tr).find('a[href*="resultats.php"]').attr("href");
  if (!href) return { result_url: null, ffn_competition_id: null, ffn_event_id: null };
  const full = href.startsWith("http") ? href : `https://ffn.extranat.fr/webffn/${href}`;
  const idcptMatch = full.match(/idcpt=(\d+)/);
  const ideprMatch = full.match(/idepr=(\d+)/);
  return {
    result_url: full,
    ffn_competition_id: idcptMatch ? idcptMatch[1] : null,
    ffn_event_id: ideprMatch ? ideprMatch[1] : null,
  };
}

// Petit garde-fou : Supabase-js NE lève PAS d'exception sur une erreur de
// requête (RLS, colonne manquante...), il renvoie juste { error }. Sans ce
// check, une synchro peut "réussir" silencieusement sans rien écrire.
function assertNoError(step, error) {
  if (error) {
    throw new Error(`${step} : ${error.message}`);
  }
}

// ---- Saisie manuelle --------------------------------------------------

export async function addResult(formData) {
  const supabase = createClient();

  const { error } = await supabase.from("swim_results").insert({
    participant_sport_id: formData.get("participant_sport_id"),
    event_name: formData.get("event_name"),
    stroke: formData.get("stroke") || null,
    distance_m: formData.get("distance_m") ? Number(formData.get("distance_m")) : null,
    pool_length: formData.get("pool_length") ? Number(formData.get("pool_length")) : null,
    time_ms: swimTimeToMs(formData.get("time_text")),
    competition_date: formData.get("competition_date") || null,
    location: formData.get("location") || null,
    source: "manuel",
  });
  assertNoError("Ajout du résultat", error);

  revalidatePath("/natation");
}

export async function deleteResult(formData) {
  const supabase = createClient();
  await supabase.from("swim_results").delete().eq("id", formData.get("id"));
  revalidatePath("/natation");
}

// ---- ID / URL FFN ---------------------------------------------------------

export async function updateFfnId(formData) {
  const supabase = createClient();

  const { error } = await supabase
    .from("participant_sports")
    .update({ ffn_swimmer_id: formData.get("ffn_swimmer_id") || null })
    .eq("id", formData.get("participant_sport_id"));
  assertNoError("Enregistrement de l'ID FFN", error);

  revalidatePath("/natation");
}

// ---- Synchronisation FFN (expérimentale, scraping HTML) -------------------

export async function syncFfnResults(formData) {
  const supabase = createClient();
  const participantSportId = formData.get("participant_sport_id");

  const { data: ps, error: readError } = await supabase
    .from("participant_sports")
    .select("*")
    .eq("id", participantSportId)
    .single();

  if (readError || !ps) {
    // On ne peut pas écrire l'erreur nulle part de fiable ici : on la
    // remonte quand même dans les logs serveur (visible dans Vercel).
    console.error("syncFfnResults: lecture participant_sports impossible", readError);
    revalidatePath("/natation");
    return;
  }

  const raw = ps.ffn_swimmer_id;

  if (!raw) {
    await supabase
      .from("participant_sports")
      .update({
        last_ffn_sync_at: new Date().toISOString(),
        last_ffn_sync_error:
          "Aucun ID/URL FFN renseigné. Colle l'ID (ou l'URL complète de la fiche) ci-dessous.",
      })
      .eq("id", participantSportId);
    revalidatePath("/natation");
    return;
  }

  const url = raw.startsWith("http")
    ? raw
    : `https://ffn.extranat.fr/webffn/nat_recherche.php?idrch_id=${encodeURIComponent(raw)}`;

  let rowsInserted = 0;

  try {
    const cheerio = await import("cheerio");

    const res = await fetch(url, {
      headers: { "User-Agent": FFN_USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Page FFN inaccessible (HTTP ${res.status}).`);

    const html = await res.text();
    const $ = cheerio.load(html);

    const rows = [];

    $("table").each((_, table) => {
      const headerText = $(table).find("th").first().text();
      const poolMatch = headerText.match(/(\d+)\s*m[eè]tres/i);
      const poolLength = poolMatch ? parseInt(poolMatch[1], 10) : null;

      $(table)
        .find("tr")
        .each((__, tr) => {
          const cellEls = $(tr).find("td, th").toArray();
          if (cellEls.length < 3) return;

          const cells = cellEls.map((el) => $(el).text().trim());

          const eventCell = cells.find((c) => looksLikeEvent(c));
          if (!eventCell) return;
          const timeCell = cells.find((c) => looksLikeTime(c));
          if (!timeCell) return;

          const ageCell = cells.find((c) => looksLikeAge(c));
          const pointsCell = cells.find((c) => looksLikePoints(c));
          const dateCell = cells.find((c) => looksLikeDate(c));
          const levelCell = cells.find((c) => looksLikeLevel(c));

          const known = new Set(
            [eventCell, timeCell, ageCell, pointsCell, dateCell, levelCell].filter(Boolean)
          );
          const remaining = cells.filter((c) => c && !known.has(c));
          const locationCell = remaining[0] || null;

          const { result_url, ffn_competition_id, ffn_event_id } = extractResultLink($, tr);

          rows.push({
            poolLength,
            eventCell,
            timeCell,
            ageCell,
            pointsCell,
            dateCell,
            locationCell,
            result_url,
            ffn_competition_id,
            ffn_event_id,
          });
        });
    });

    if (rows.length === 0) {
      throw new Error(
        "Aucune performance reconnue sur cette page — le format a peut-être changé, ou l'ID/URL est incorrect."
      );
    }

    for (const row of rows) {
      const { distance_m, stroke } = parseEvent(row.eventCell);
      const time_ms = parseFfnTime(row.timeCell);
      const age_at_swim = row.ageCell ? parseInt(row.ageCell.replace(/\D/g, ""), 10) || null : null;
      const points = row.pointsCell ? parseInt(row.pointsCell.replace(/\D/g, ""), 10) || null : null;

      let competition_date = null;
      const dateMatch = (row.dateCell || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        competition_date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      }

      const payload = {
        participant_sport_id: participantSportId,
        event_name: row.eventCell,
        stroke,
        distance_m,
        pool_length: row.poolLength,
        time_ms,
        points,
        age_at_swim,
        location: row.locationCell,
        competition_date,
        result_url: row.result_url,
        ffn_competition_id: row.ffn_competition_id,
        ffn_event_id: row.ffn_event_id,
        source: "ffn",
      };

      const { error: writeError } =
        row.ffn_competition_id && row.ffn_event_id
          ? await supabase
              .from("swim_results")
              .upsert(payload, { onConflict: "participant_sport_id,ffn_competition_id,ffn_event_id" })
          : await supabase.from("swim_results").insert(payload);

      if (writeError) {
        throw new Error(`Écriture en base impossible (${writeError.message}). As-tu bien joué le script 6-natation-full-results.sql ?`);
      }
      rowsInserted += 1;
    }

    const { error: okError } = await supabase
      .from("participant_sports")
      .update({
        last_ffn_sync_at: new Date().toISOString(),
        last_ffn_sync_error: null,
      })
      .eq("id", participantSportId);
    assertNoError("Mise à jour du statut de synchro", okError);
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

// ---- Résultats complets d'une compétition (tous les nageurs) --------------

export async function fetchMeetResults(formData) {
  const supabase = createClient();
  const resultId = formData.get("swim_result_id");

  const { data: result, error: readError } = await supabase
    .from("swim_results")
    .select("*")
    .eq("id", resultId)
    .single();

  if (readError || !result) {
    console.error("fetchMeetResults: lecture swim_results impossible", readError);
    revalidatePath("/natation");
    return;
  }

  if (!result.ffn_competition_id || !result.ffn_event_id) {
    await supabase
      .from("swim_results")
      .update({
        meet_fetch_error: "Pas d'identifiant de compétition FFN pour cette performance.",
      })
      .eq("id", resultId);
    revalidatePath("/natation");
    return;
  }

  try {
    const cheerio = await import("cheerio");
    const url =
      result.result_url ||
      `https://ffn.extranat.fr/webffn/resultats.php?idact=nat&idcpt=${result.ffn_competition_id}&idepr=${result.ffn_event_id}`;

    const res = await fetch(url, {
      headers: { "User-Agent": FFN_USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Page FFN inaccessible (HTTP ${res.status}).`);

    const html = await res.text();
    const $ = cheerio.load(html);

    const eventLabel = $("table").first().find("th").first().text().trim() || null;
    const title = $("h1, h2, h3")
      .filter((_, el) => $(el).text().trim().length > 0)
      .first()
      .text()
      .trim();
    const competitionName = title || null;

    const rows = [];

    $("table tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 4) return;

      const rankText = $(tds[0]).text().trim();
      if (!/^\d+\.$|^-+\.?$/.test(rankText)) return;

      const swimmerText = $(tds[1]).text().trim();
      if (!swimmerText) return;
      const swimmerMatch = swimmerText.match(/^(.+?)\s*\((\d{4})\/\d+\s*ans\)\s*([A-Za-z]{2,3})$/);

      const clubText = $(tds[2]).text().trim();
      const timeText = $(tds[3]).text().trim();
      const pointsText = tds.length > 5 ? $(tds[5]).text().trim() : "";

      rows.push({
        rank: rankText,
        swimmer_name: swimmerMatch ? swimmerMatch[1].trim() : swimmerText,
        birth_year: swimmerMatch ? parseInt(swimmerMatch[2], 10) : null,
        swimmer_club: clubText || null,
        time_ms: /^\d/.test(timeText) ? parseFfnTime(timeText) : null,
        points: /\d/.test(pointsText) ? parseInt(pointsText.replace(/\D/g, ""), 10) : null,
      });
    });

    if (rows.length === 0) {
      throw new Error("Aucun nageur trouvé sur cette page de résultats.");
    }

    for (const row of rows) {
      const { error: writeError } = await supabase.from("swim_meet_results").upsert(
        {
          ffn_competition_id: result.ffn_competition_id,
          ffn_event_id: result.ffn_event_id,
          event_label: eventLabel,
          competition_name: competitionName,
          swimmer_name: row.swimmer_name,
          swimmer_club: row.swimmer_club,
          birth_year: row.birth_year,
          rank: row.rank,
          time_ms: row.time_ms,
          points: row.points,
          fetched_by_participant_sport_id: result.participant_sport_id,
        },
        { onConflict: "ffn_competition_id,ffn_event_id,swimmer_name" }
      );
      if (writeError) {
        throw new Error(`Écriture en base impossible (${writeError.message}).`);
      }
    }

    await supabase.from("swim_results").update({ meet_fetch_error: null }).eq("id", resultId);
  } catch (err) {
    await supabase
      .from("swim_results")
      .update({ meet_fetch_error: String(err?.message || err).slice(0, 300) })
      .eq("id", resultId);
  }

  revalidatePath("/natation");
}
