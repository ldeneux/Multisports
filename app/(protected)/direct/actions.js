"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { liveStreamId, muxConfigured, muxFetch } from "@/lib/mux";

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");
  return user;
}

// À utiliser UNE seule fois : crée le flux Mux réutilisable (même clé pour tous les directs).
export async function createLiveStream() {
  try {
    await requireUser();
    if (!muxConfigured()) {
      return { error: "MUX_TOKEN_ID et MUX_TOKEN_SECRET ne sont pas configurés sur le serveur." };
    }
    const base = {
      playback_policy: ["public"],
      new_asset_settings: { playback_policy: ["public"] },
    };
    let data;
    let simplified = false;
    try {
      // Garde-fous : faible latence + coupure automatique après 2 h pour qu'un flux oublié ne coûte pas cher.
      data = await muxFetch("/video/v1/live-streams", {
        method: "POST",
        body: { ...base, latency_mode: "low", max_continuous_duration: 7200 },
      });
    } catch (e) {
      if (e.status !== 400) throw e;
      data = await muxFetch("/video/v1/live-streams", { method: "POST", body: base });
      simplified = true;
    }
    return { id: data.id, simplified };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

// Réglages à saisir dans l'appli de streaming du téléphone (la clé est secrète : on ne l'affiche que sur demande).
export async function revealBroadcastSettings() {
  try {
    await requireUser();
    const stream = await muxFetch(`/video/v1/live-streams/${liveStreamId()}`);
    return { url: "rtmps://global-live.mux.com:443/app", key: stream.stream_key };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

export async function deleteReplay(assetId) {
  try {
    await requireUser();
    const asset = await muxFetch(`/video/v1/assets/${assetId}`);
    // On ne supprime que les replays issus de NOTRE flux.
    if (!asset || asset.live_stream_id !== liveStreamId()) {
      return { error: "Cette vidéo n'appartient pas au flux de l'appli." };
    }
    await muxFetch(`/video/v1/assets/${assetId}`, { method: "DELETE" });
    revalidatePath("/direct");
    return { ok: true };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}
