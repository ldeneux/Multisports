"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseVideoLink } from "@/lib/replays";

async function currentUser(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

const clean = (v) => {
  const s = String(v ?? "").trim();
  return s || null;
};

// Crée un replay (match ou compétition) avec ses chapitres.
// input = { title, sport, recorded_on, season, team, division, match_id, chapters: [{ label, subtitle, url }] }
export async function addReplayGroup(input) {
  const supabase = createClient();
  if (!(await currentUser(supabase))) return { error: "Non connecté." };

  const title = clean(input?.title);
  if (!title) return { error: "Le titre est obligatoire." };

  const sport = ["basket", "natation", "autre"].includes(input?.sport) ? input.sport : "basket";
  const recordedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.recorded_on ?? "")) ? input.recorded_on : null;

  const chapters = [];
  for (const c of Array.isArray(input?.chapters) ? input.chapters : []) {
    const url = String(c?.url ?? "").trim();
    if (!url) continue; // ligne laissée vide : ignorée
    const label = clean(c?.label) ?? `Chapitre ${chapters.length + 1}`;
    const parsed = parseVideoLink(url);
    if (!parsed) {
      return { error: `Lien non reconnu pour « ${label} » : colle l'adresse complète (https://…) de la vidéo.` };
    }
    chapters.push({
      label,
      subtitle: clean(c?.subtitle),
      url,
      provider: parsed.provider,
      video_ref: parsed.ref,
      position: chapters.length,
    });
  }

  const { data: group, error } = await supabase
    .from("replay_groups")
    .insert({
      title,
      sport,
      recorded_on: recordedOn,
      season: clean(input?.season),
      team: clean(input?.team),
      division: clean(input?.division),
      match_id: sport === "basket" ? clean(input?.match_id) : null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (chapters.length) {
    const { error: chapterError } = await supabase
      .from("replay_chapters")
      .insert(chapters.map((c) => ({ ...c, group_id: group.id })));
    if (chapterError) {
      await supabase.from("replay_groups").delete().eq("id", group.id);
      return { error: chapterError.message };
    }
  }

  revalidatePath("/replays");
  return { ok: true };
}

// Ajoute un chapitre à la fin d'un replay existant (par exemple quand une vidéo finit d'être envoyée).
export async function addChapter(groupId, input) {
  const supabase = createClient();
  if (!(await currentUser(supabase))) return { error: "Non connecté." };

  const url = String(input?.url ?? "").trim();
  const parsed = parseVideoLink(url);
  if (!parsed) return { error: "Lien non reconnu : colle l'adresse complète (https://…) de la vidéo." };

  const { data: last } = await supabase
    .from("replay_chapters")
    .select("position")
    .eq("group_id", groupId)
    .order("position", { ascending: false })
    .limit(1);
  const position = last?.length ? last[0].position + 1 : 0;

  const { error } = await supabase.from("replay_chapters").insert({
    group_id: groupId,
    label: clean(input?.label) ?? `Chapitre ${position + 1}`,
    subtitle: clean(input?.subtitle),
    url,
    provider: parsed.provider,
    video_ref: parsed.ref,
    position,
  });
  if (error) return { error: error.message };

  revalidatePath("/replays");
  return { ok: true };
}

export async function deleteChapter(id) {
  const supabase = createClient();
  if (!(await currentUser(supabase))) return { error: "Non connecté." };
  const { error } = await supabase.from("replay_chapters").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/replays");
  return { ok: true };
}

// Supprime le replay et tous ses chapitres (les vidéos restent sur YouTube / Drive).
export async function deleteGroup(id) {
  const supabase = createClient();
  if (!(await currentUser(supabase))) return { error: "Non connecté." };
  const { error } = await supabase.from("replay_groups").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/replays");
  return { ok: true };
}

// Monte ou descend un chapitre : change l'ordre d'affichage et de lecture de « Tout lire ».
export async function moveChapter(id, direction) {
  const supabase = createClient();
  if (!(await currentUser(supabase))) return { error: "Non connecté." };

  const { data: current } = await supabase.from("replay_chapters").select("id, group_id").eq("id", id).maybeSingle();
  if (!current) return { error: "Chapitre introuvable." };

  const { data: siblings, error } = await supabase
    .from("replay_chapters")
    .select("id, position")
    .eq("group_id", current.group_id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };

  const i = siblings.findIndex((s) => s.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return { ok: true };

  const reordered = [...siblings];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  for (const [index, row] of reordered.entries()) {
    if (row.position === index) continue;
    const { error: updateError } = await supabase.from("replay_chapters").update({ position: index }).eq("id", row.id);
    if (updateError) return { error: updateError.message };
  }

  revalidatePath("/replays");
  return { ok: true };
}
