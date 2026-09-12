"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Les champs propres à chaque sport sont envoyés avec un préfixe
// "detail__" (ex. name="detail__profondeur_max") — on les recollecte ici en
// objet JSON pour la colonne `details`. Ça marche aussi bien pour le
// formulaire d'ajout (cascade en JS) que pour le formulaire d'édition (pur
// HTML, aucun JS nécessaire puisque le sport est déjà fixé).
function collectDetails(formData) {
  const details = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("detail__") && value !== "") {
      details[key.slice("detail__".length)] = value;
    }
  }
  return details;
}

async function uploadResultFile(supabase, file) {
  if (!file || typeof file !== "object" || file.size === 0) return null;
  const fileExt = file.name.split(".").pop();
  const filePath = `${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
  if (uploadError) return null;

  const { data } = supabase.storage.from("documents").getPublicUrl(filePath);
  return { url: data.publicUrl, name: file.name };
}

async function attachFiles(supabase, resultId, files) {
  for (const file of files) {
    const uploaded = await uploadResultFile(supabase, file);
    if (uploaded) {
      await supabase.from("other_sport_result_files").insert({
        result_id: resultId,
        file_url: uploaded.url,
        file_name: uploaded.name,
      });
    }
  }
}

export async function addOtherSportResult(formData) {
  const supabase = createClient();

  const { data: inserted, error } = await supabase
    .from("other_sport_results")
    .insert({
      participant_id: formData.get("participant_id"),
      sport_id: formData.get("sport_id"),
      result_date: formData.get("result_date") || null,
      event_time: formData.get("event_time") || null,
      title: (formData.get("title") || "").trim() || null,
      nb_days: formData.get("nb_days") ? Number(formData.get("nb_days")) : 1,
      location: formData.get("location") || null,
      link_url: formData.get("link_url") || null,
      notes: formData.get("notes") || null,
      details: collectDetails(formData),
    })
    .select()
    .single();

  if (!error && inserted) {
    const files = formData.getAll("documents").filter((f) => f && f.size > 0);
    await attachFiles(supabase, inserted.id, files);
  }

  revalidatePath("/autres-sports");
}

export async function updateOtherSportResult(formData) {
  const supabase = createClient();
  const id = formData.get("id");

  await supabase
    .from("other_sport_results")
    .update({
      result_date: formData.get("result_date") || null,
      event_time: formData.get("event_time") || null,
      title: (formData.get("title") || "").trim() || null,
      nb_days: formData.get("nb_days") ? Number(formData.get("nb_days")) : 1,
      location: formData.get("location") || null,
      link_url: formData.get("link_url") || null,
      notes: formData.get("notes") || null,
      details: collectDetails(formData),
    })
    .eq("id", id);

  const files = formData.getAll("documents").filter((f) => f && f.size > 0);
  if (files.length > 0) {
    await attachFiles(supabase, id, files);
  }

  revalidatePath("/autres-sports");
}

export async function deleteOtherSportResult(formData) {
  const supabase = createClient();
  await supabase.from("other_sport_results").delete().eq("id", formData.get("id"));
  revalidatePath("/autres-sports");
}

export async function deleteOtherSportResultFile(formData) {
  const supabase = createClient();
  await supabase.from("other_sport_result_files").delete().eq("id", formData.get("file_id"));
  revalidatePath("/autres-sports");
}
