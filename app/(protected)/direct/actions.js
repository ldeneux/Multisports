"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseYouTubeId, parseTime } from "@/lib/video";

const SETUP_HINT =
  "As-tu bien exécuté le script supabase/7-direct-replays.sql sur ce projet Supabase (il crée les tables et l'espace de stockage « videos ») ?";

async function uploadVideoFile(supabase, file) {
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("videos").upload(path, file, {
    contentType: file.type || "video/mp4",
  });
  if (error) {
    throw new Error(
      `Envoi de la vidéo impossible (${error.message}). Le fichier fait-il plus de 50 Mo ? Pour un match entier, utilise plutôt un lien YouTube. ${SETUP_HINT}`
    );
  }
  const { data } = supabase.storage.from("videos").getPublicUrl(path);
  return { path, url: data.publicUrl };
}

function hasFile(file) {
  return file && typeof file === "object" && file.size > 0;
}

export async function addVideo(formData) {
  const supabase = createClient();
  const rawUrl = (formData.get("url") ?? "").toString().trim();
  const file = formData.get("video");

  let source;
  let url = null;
  let youtube_id = null;
  let storage_path = null;

  if (hasFile(file)) {
    const up = await uploadVideoFile(supabase, file);
    source = "file";
    url = up.url;
    storage_path = up.path;
  } else if (rawUrl) {
    const id = parseYouTubeId(rawUrl);
    source = id ? "youtube" : "link";
    youtube_id = id;
    url = rawUrl;
  } else {
    throw new Error("Colle un lien (YouTube de préférence) ou choisis un fichier vidéo.");
  }

  const { data, error } = await supabase
    .from("videos")
    .insert({
      title: (formData.get("title") ?? "").toString().trim() || "Sans titre",
      participant_id: formData.get("participant_id") || null,
      sport_id: formData.get("sport_id") || null,
      event_date: formData.get("event_date") || null,
      notes: (formData.get("notes") ?? "").toString().trim() || null,
      is_live: formData.get("is_live") === "on",
      source,
      url,
      youtube_id,
      storage_path,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Enregistrement impossible (${error.message}). ${SETUP_HINT}`);

  revalidatePath("/direct");
  redirect(`/direct/${data.id}`);
}

export async function updateVideo(formData) {
  const supabase = createClient();
  const id = formData.get("id");
  const updates = {
    title: (formData.get("title") ?? "").toString().trim() || "Sans titre",
    participant_id: formData.get("participant_id") || null,
    sport_id: formData.get("sport_id") || null,
    event_date: formData.get("event_date") || null,
    notes: (formData.get("notes") ?? "").toString().trim() || null,
  };

  // Lien : modifiable seulement pour les vidéos qui ne sont pas un fichier envoyé
  const rawUrl = (formData.get("url") ?? "").toString().trim();
  if (rawUrl) {
    const ytId = parseYouTubeId(rawUrl);
    updates.url = rawUrl;
    updates.youtube_id = ytId;
    updates.source = ytId ? "youtube" : "link";
  }

  await supabase.from("videos").update(updates).eq("id", id);
  revalidatePath("/direct");
  revalidatePath(`/direct/${id}`);
}

// Passe une vidéo en « direct » ou en « replay » (quand l'événement est fini, le même lien YouTube devient le replay).
export async function setLive(formData) {
  const supabase = createClient();
  const id = formData.get("id");
  await supabase.from("videos").update({ is_live: formData.get("live") === "true" }).eq("id", id);
  revalidatePath("/direct");
  revalidatePath(`/direct/${id}`);
}

export async function deleteVideo(formData) {
  const supabase = createClient();
  const id = formData.get("id");
  const { data: video } = await supabase.from("videos").select("storage_path").eq("id", id).maybeSingle();
  if (video?.storage_path) await supabase.storage.from("videos").remove([video.storage_path]);
  await supabase.from("videos").delete().eq("id", id);
  revalidatePath("/direct");
  redirect("/direct");
}

export async function addMoment(formData) {
  const supabase = createClient();
  const video_id = formData.get("video_id");
  const label = (formData.get("label") ?? "").toString().trim();
  const start = parseTime(formData.get("start"));
  const end = parseTime(formData.get("end"));

  if (!label) throw new Error("Donne un nom au passage (ex. « 50 m nage libre »).");
  if (start === null) throw new Error("Début illisible : écris-le sous la forme 12:30 ou 1:02:03.");
  if (end !== null && end <= start) throw new Error("La fin du passage doit être après son début.");

  const { error } = await supabase.from("video_moments").insert({ video_id, label, start_sec: start, end_sec: end });
  if (error) throw new Error(`Enregistrement impossible (${error.message}). ${SETUP_HINT}`);
  revalidatePath(`/direct/${video_id}`);
}

export async function deleteMoment(formData) {
  const supabase = createClient();
  await supabase.from("video_moments").delete().eq("id", formData.get("id"));
  revalidatePath(`/direct/${formData.get("video_id")}`);
}
