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

function parseEvent(eventNameRaw) {
  const eventName = eventNameRaw.replace(/\b(Dames|Messieurs|Mixte)\b/gi, "").trim();
  const match = eventName.match(/^(\d+)\s*(.+)$/);
  if (!match) return { distance_m: null, stroke: eventName || eventNameRaw };
  const distance_m = parseInt(match[1], 10);
  const rest = match[2].trim().toLowerCase();
  const found = STROKE_PATTERNS.find((s) => rest.includes(s.key));
  return { distance_m, stroke: found ? found.label : match[2].trim() };
}

function parseFfnTimeText(text) {
  if (!text || !/^\d/.test(text)) return null;
  const cleaned = text.trim().replace(/^00:(?=\d{1,2}:)/, "");
  return swimTimeToMs(cleaned);
}

function cleanEventHeader(text) {
  return text
    .replace(/(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+\d{1,2}\s+\w+\.?\s+\d{4}.*$/i, "")
    .replace(/-\s*(Séries|Finale[s]?(\s*[AB])?|Éliminatoires)\s*$/i, "")
    .trim();
}

// Supabase-js ne lève pas d'exception sur une erreur de requête : il faut
// vérifier { error } explicitement, sinon un échec passe inaperçu.
function assertNoError(step, error) {
  if (error) throw new Error(`${step} : ${error.message}`);
}

// ---- Config club + synchro (expérimentale, scraping HTML) -----------------

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

    // On repère chaque lien de compétition, puis on regarde le texte qui
    // l'entoure (fenêtre glissante) pour en déduire niveau/date/ville/bassin
    // — on ne connaît pas la structure exacte des balises à l'avance, donc
    // on évite de dépendre d'une hiérarchie DOM précise.
    const linkPattern = /<a[^>]*href="[^"]*resultats\.php\?idact=nat&idcpt=(\d+)"[^>]*>([^<]+)<\/a>/g;
    const competitionsMap = {};
    let match;
    while ((match = linkPattern.exec(listHtml)) !== null) {
      const idcpt = match[1];
      const name = match[2].trim();
      const before = listHtml.slice(Math.max(0, match.index - 900), match.index);
      const after = listHtml.slice(match.index, Math.min(listHtml.length, match.index + match[0].length + 500));

      if (!/D[ée]partemental/.test(before)) continue;

      const poolLength = /compets_50m/.test(before) ? 50 : /compets_25m/.test(before) ? 25 : null;
      const dateMatches = [...before.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
      let competition_date = null;
      if (dateMatches.length > 0) {
        const last = dateMatches[dateMatches.length - 1];
        competition_date = `${last[3]}-${last[2]}-${last[1]}`;
      }
      const cityMatch = after.match(/>([A-ZÀ-Ü][A-ZÀ-Ü\s\-']{2,40})\s*\(FRA\)/);
      const city = cityMatch ? cityMatch[1].trim() : null;

      competitionsMap[idcpt] = { idcpt, name, poolLength, competition_date, city };
    }

    const competitions = Object.values(competitionsMap);
    competitionsFound = competitions.length;

    if (competitions.length === 0) {
      throw new Error(
        "Aucune compétition départementale trouvée pour cet ID club / cette saison — vérifie les deux valeurs."
      );
    }

    for (const comp of competitions) {
      const { data: compRow, error: compError } = await supabase
        .from("swim_competitions")
        .upsert(
          {
            ffn_competition_id: comp.idcpt,
            name: comp.name,
            city: comp.city,
            level: "Départemental",
            pool_length: comp.poolLength,
            competition_date: comp.competition_date,
            season_year: Number(seasonYear),
            synced_at: new Date().toISOString(),
          },
          { onConflict: "ffn_competition_id" }
        )
        .select()
        .single();
      if (compError) throw new Error(`Écriture compétition impossible (${compError.message}).`);

      const resUrl = `https://ffn.extranat.fr/webffn/resultats.php?idact=nat&idcpt=${comp.idcpt}`;
      const resResponse = await fetch(resUrl, {
        headers: { "User-Agent": FFN_USER_AGENT },
        cache: "no-store",
      });
      if (!resResponse.ok) continue; // une compétition en erreur ne bloque pas les autres

      const resHtml = await resResponse.text();
      const $ = cheerio.load(resHtml);

      let currentEvent = null;
      const rows = [];

      $("table tr").each((_, tr) => {
        const tds = $(tr).find("td");
        const ths = $(tr).find("th");

        if (ths.length === 1 && tds.length === 0) {
          const headerText = $(ths[0]).text().trim();
          if (headerText && /^\d/.test(headerText) && !/^Légende/i.test(headerText)) {
            currentEvent = cleanEventHeader(headerText);
          }
          return;
        }

        if (tds.length < 4 || !currentEvent) return;

        const rankText = $(tds[0]).text().trim();
        if (!/^\d+\.$|^-+\.?$/.test(rankText)) return;

        const swimmerLink = $(tds[1]).find("a").first();
        const swimmerText = swimmerLink.text().trim() || $(tds[1]).text().trim();
        const swimmerHref = swimmerLink.attr("href") || "";
        const idMatch = swimmerHref.match(/#(\d+)/);
        const ffnSwimmerId = idMatch ? idMatch[1] : null;
        if (!ffnSwimmerId) return;

        const nameMatch = swimmerText.match(/^(.+?)\s*\((\d{4})\/\d+\s*ans\)/);

        const clubLink = $(tds[2]).find("a").first();
        const clubText = clubLink.text().trim() || $(tds[2]).text().trim();
        const clubHref = clubLink.attr("href") || "";
        const idclbMatch = clubHref.match(/idclb=(\d+)/);

        const timeText = $(tds[3]).text().trim();
        const pointsText = tds.length > 5 ? $(tds[5]).text().trim() : "";

        rows.push({
          event: currentEvent,
          ffnSwimmerId,
          swimmerName: nameMatch ? nameMatch[1].trim() : swimmerText,
          birthYear: nameMatch ? parseInt(nameMatch[2], 10) : null,
          club: clubText || null,
          ffnClubIdForSwimmer: idclbMatch ? idclbMatch[1] : null,
          rank: rankText,
          timeText,
          pointsText,
        });
      });

      const { error: delError } = await supabase
        .from("swim_results")
        .delete()
        .eq("competition_id", compRow.id);
      assertNoError("Nettoyage des anciens résultats", delError);

      for (const row of rows) {
        const { data: swimmerRow, error: swimmerError } = await supabase
          .from("swimmers")
          .upsert(
            {
              ffn_swimmer_id: row.ffnSwimmerId,
              full_name: row.swimmerName,
              club: row.club,
              ffn_club_id: row.ffnClubIdForSwimmer,
              birth_year: row.birthYear,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "ffn_swimmer_id" }
          )
          .select()
          .single();
        if (swimmerError) throw new Error(`Écriture nageur impossible (${swimmerError.message}).`);

        const { distance_m, stroke } = parseEvent(row.event);
        const time_ms = parseFfnTimeText(row.timeText);

        const { error: resultError } = await supabase.from("swim_results").upsert(
          {
            competition_id: compRow.id,
            swimmer_id: swimmerRow.id,
            event_name: row.event,
            stroke,
            distance_m,
            rank: row.rank,
            time_ms,
            time_label: time_ms === null ? row.timeText : null,
            points: /\d/.test(row.pointsText) ? parseInt(row.pointsText.replace(/\D/g, ""), 10) : null,
          },
          { onConflict: "competition_id,swimmer_id,event_name" }
        );
        if (resultError) throw new Error(`Écriture résultat impossible (${resultError.message}).`);
        resultsWritten += 1;
      }
    }

    // Rattache automatiquement les nageuses de la famille (via l'ID FFN
    // personnel connu sur leur fiche Paramètres/Basket... ici Natation) à
    // leur profil participant.
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

    await supabase
      .from("participant_sports")
      .update({
        last_ffn_sync_at: new Date().toISOString(),
        last_ffn_sync_error: null,
        last_ffn_sync_summary: `${competitionsFound} compétition(s) départementale(s), ${resultsWritten} résultat(s).`,
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
