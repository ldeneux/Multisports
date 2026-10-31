"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseVideoLink } from "@/lib/replays";

export async function addReplay(formData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const url = String(formData.get("url") ?? "").trim();
  const parsed = parseVideoLink(url);
  if (!parsed) {
    return { error: "Lien non reconnu : colle l'adresse complète (https://…) de la vidéo YouTube ou Google Drive." };
  }

  const sportRaw = String(formData.get("sport") ?? "basket");
  const sport = ["basket", "natation", "autre"].includes(sportRaw) ? sportRaw : "basket";
  const title = String(formData.get("title") ?? "").trim() || "Replay";
  let recordedOn = String(formData.get("recorded_on") ?? "").trim() || null;
  const matchId = sport === "basket" ? String(formData.get("match_id") ?? "").trim() || null : null;

  // Pas de date saisie mais un match choisi : on reprend la date du match.
  if (!recordedOn && matchId) {
    const { data: match } = await supabase
      .from("basketball_matches")
      .select("match_date")
      .eq("id", matchId)
      .maybeSingle();
    if (match?.match_date) recordedOn = new Date(match.match_date).toISOString().slice(0, 10);
  }

  const { error } = await supabase.from("replays").insert({
    title,
    url,
    provider: parsed.provider,
    video_ref: parsed.ref,
    sport,
    recorded_on: recordedOn,
    match_id: matchId,
  });
  if (error) return { error: error.message };

  revalidatePath("/replays");
  return { ok: true };
}

export async function deleteReplay(id) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { error } = await supabase.from("replays").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/replays");
  return { ok: true };
}
