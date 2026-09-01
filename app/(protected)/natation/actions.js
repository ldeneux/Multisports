"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { swimTimeToMs } from "@/lib/utils";

const STROKE_PATTERNS = [
  { key: "papillon", label: "Papillon" },
  { key: "dos", label: "Dos" },
  { key: "brasse", label: "Brasse" },
  { key: "4 nages", label: "4 Nages" },
  { key: "4n", label: "4 Nages" },
  { key: "nl", label: "Nage libre" },
  { key: "libre", label: "Nage libre" },
];

// "100 Dos" -> { distance_m: 100, stroke: "Dos" }
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
  // Le site affiche parfois "00:58.90" -> on retire l'heure à zéro en tête.
  const cleaned = text.trim().replace(/^00:(?=\d{1,2}:)/, "");
  return swimTimeToMs(cleaned);
}

// ---- Saisie manuelle --------------------------------------------------

export async function addResult(formData) {
  const supabase = createClient();

  await supabase.from("swim_results").insert({
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

  revalidatePath("/natation");
}

export async function deleteResult(formData) {
  const supabase = createClient();
  await supabase.from("swim_results").delete().eq("id", formData.get("id"));
  revalidatePath("/natation");
}

// ---- ID FFN manuel ------------------------------------------------------

export async function updateFfnId(formData) {
  const supabase = createClient();

  await supabase
    .from("participant_sports")
    .update({ ffn_swimmer_id: formData.get("ffn_swimmer_id") || null })
    .eq("id", formData.get("participant_sport_id"));

  revalidatePath("/natation");
}

// ---- Synchronisation FFN (expérimentale, scraping HTML) -------------------

export async function syncFfnResults(formData) {
  const supabase = createClient();
  const participantSportId = formData.get("participant_sport_id");

  const { data: ps } = await supabase
    .from("participant_sports")
    .select("*")
    .eq("id", participantSportId)
    .single();

  if (!ps) return;

  const swimmerId = ps.ffn_swimmer_id;

  if (!swimmerId) {
    await supabase
      .from("participant_sports")
      .update({
        last_ffn_sync_at: new Date().toISOString(),
        last_ffn_sync_error:
          "Aucun ID FFN renseigné. Trouve-le sur la fiche nageur (ffn.extranat.fr, page « Rechercher des Perf. »), c'est le nombre entre crochets à côté du nom.",
      })
      .eq("id", participantSportId);
    revalidatePath("/natation");
    return;
  }

  try {
    const cheerio = await import("cheerio");
    const url = `https://ffn.extranat.fr/webffn/nat_recherche.php?idrch_id=${encodeURIComponent(swimmerId)}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SportFamilleApp/1.0)" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Page FFN inaccessible (HTTP ${res.status}).`);
    }

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
          const cells = $(tr)
            .find("td")
            .map((___, td) => $(td).text().trim())
            .get();

          if (cells.length < 5) return;

          const [eventName, timeText, ageText, pointsText, locationText, dateText] = cells;
          if (!eventName || !timeText || !/^\d/.test(eventName)) return;

          rows.push({ poolLength, eventName, timeText, ageText, pointsText, locationText, dateText });
        });
    });

    if (rows.length === 0) {
      throw new Error(
        "Aucune performance trouvée pour cet ID sur la page FFN — vérifie qu'il est correct."
      );
    }

    for (const row of rows) {
      const { distance_m, stroke } = parseEvent(row.eventName);
      const time_ms = parseFfnTime(row.timeText);
      const age_at_swim = row.ageText
        ? parseInt(row.ageText.replace(/\D/g, ""), 10) || null
        : null;
      const points = row.pointsText
        ? parseInt(row.pointsText.replace(/\D/g, ""), 10) || null
        : null;

      let competition_date = null;
      const dateMatch = (row.dateText || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        competition_date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      }

      await supabase.from("swim_results").upsert(
        {
          participant_sport_id: participantSportId,
          event_name: row.eventName,
          stroke,
          distance_m,
          pool_length: row.poolLength,
          time_ms,
          points,
          age_at_swim,
          location: row.locationText || null,
          competition_date,
          source: "ffn",
        },
        { onConflict: "participant_sport_id,event_name,pool_length" }
      );
    }

    await supabase
      .from("participant_sports")
      .update({
        last_ffn_sync_at: new Date().toISOString(),
        last_ffn_sync_error: null,
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
