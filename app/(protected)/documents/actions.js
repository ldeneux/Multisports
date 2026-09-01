"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addDocument(formData) {
  const supabase = createClient();

  let document_url = null;
  const file = formData.get("document");

  if (file && typeof file === "object" && file.size > 0) {
    const fileExt = file.name.split(".").pop();
    const filePath = `${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, file);

    if (!uploadError) {
      const { data } = supabase.storage.from("documents").getPublicUrl(filePath);
      document_url = data.publicUrl;
    }
  }

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

export async function deleteDocument(formData) {
  const supabase = createClient();
  await supabase.from("documents").delete().eq("id", formData.get("id"));
  revalidatePath("/documents");
}
