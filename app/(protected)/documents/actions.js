"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function uploadDocumentFile(supabase, file) {
  if (!file || typeof file !== "object" || file.size === 0) return null;
  const fileExt = file.name.split(".").pop();
  const filePath = `${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
  if (uploadError) return null;

  const { data } = supabase.storage.from("documents").getPublicUrl(filePath);
  return data.publicUrl;
}

export async function addDocument(formData) {
  const supabase = createClient();

  const document_url = await uploadDocumentFile(supabase, formData.get("document"));
  const sport_id = formData.get("sport_id");

  await supabase.from("documents").insert({
    participant_id: formData.get("participant_id"),
    sport_id: sport_id || null,
    kind: formData.get("kind"),
    title: formData.get("title"),
    organization: formData.get("organization") || null,
    obtained_date: formData.get("obtained_date") || null,
    valid_until: formData.get("valid_until") || null,
    notes: formData.get("notes") || null,
    document_url,
  });

  revalidatePath("/documents");
}

export async function updateDocument(formData) {
  const supabase = createClient();
  const id = formData.get("id");
  const sport_id = formData.get("sport_id");

  const updates = {
    sport_id: sport_id || null,
    kind: formData.get("kind"),
    title: formData.get("title"),
    organization: formData.get("organization") || null,
    obtained_date: formData.get("obtained_date") || null,
    valid_until: formData.get("valid_until") || null,
    notes: formData.get("notes") || null,
  };

  // On ne remplace le fichier que si un nouveau a été choisi — sinon on
  // garde celui déjà enregistré.
  const newUrl = await uploadDocumentFile(supabase, formData.get("document"));
  if (newUrl) updates.document_url = newUrl;

  await supabase.from("documents").update(updates).eq("id", id);
  revalidatePath("/documents");
}

export async function deleteDocument(formData) {
  const supabase = createClient();
  await supabase.from("documents").delete().eq("id", formData.get("id"));
  revalidatePath("/documents");
}
