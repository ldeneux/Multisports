"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

// ---- Participants -----------------------------------------------------

export async function addParticipant(formData) {
  const supabase = createClient();

  await supabase.from("participants").insert({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name") || null,
    sex: formData.get("sex") || null,
    birthdate: formData.get("birthdate") || null,
  });

  revalidatePath("/parametres");
  revalidatePath("/");
}

export async function updateParticipant(formData) {
  const supabase = createClient();

  await supabase
    .from("participants")
    .update({
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name") || null,
      sex: formData.get("sex") || null,
      birthdate: formData.get("birthdate") || null,
    })
    .eq("id", formData.get("id"));

  revalidatePath("/parametres");
  revalidatePath("/");
}

export async function deleteParticipant(formData) {
  const supabase = createClient();
  await supabase.from("participants").delete().eq("id", formData.get("id"));
  revalidatePath("/parametres");
  revalidatePath("/");
}

// ---- Sports -------------------------------------------------------------

export async function addSport(formData) {
  const supabase = createClient();
  const name = formData.get("name");

  await supabase.from("sports").insert({
    name,
    slug: slugify(name),
    is_main: false,
  });

  revalidatePath("/parametres");
}

export async function deleteSport(formData) {
  const supabase = createClient();
  await supabase.from("sports").delete().eq("id", formData.get("id"));
  revalidatePath("/parametres");
}

// ---- Affectations participant <-> sport ---------------------------------

export async function addAssignment(formData) {
  const supabase = createClient();

  await supabase.from("participant_sports").insert({
    participant_id: formData.get("participant_id"),
    sport_id: formData.get("sport_id"),
    club: formData.get("club") || null,
    category: formData.get("category") || null,
    link_url: formData.get("link_url") || null,
  });

  revalidatePath("/parametres");
  revalidatePath("/");
}

export async function updateAssignment(formData) {
  const supabase = createClient();

  await supabase
    .from("participant_sports")
    .update({
      club: formData.get("club") || null,
      category: formData.get("category") || null,
      link_url: formData.get("link_url") || null,
    })
    .eq("id", formData.get("id"));

  revalidatePath("/parametres");
  revalidatePath("/");
}

export async function deleteAssignment(formData) {
  const supabase = createClient();
  await supabase.from("participant_sports").delete().eq("id", formData.get("id"));
  revalidatePath("/parametres");
  revalidatePath("/");
}
