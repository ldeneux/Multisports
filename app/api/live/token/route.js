import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Délivre un jeton LiveKit pour la salle d'un match.
//  - role "broadcast" : peut publier caméra + micro (le parent qui filme)
//  - role "watch"     : peut seulement regarder
// Il faut être connecté à l'app ET pouvoir lire le match (règles RLS Supabase).
export async function POST(request) {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "LIVEKIT_URL, LIVEKIT_API_KEY et LIVEKIT_API_SECRET ne sont pas configurés sur le serveur." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const matchId = String(body?.matchId ?? "");
  const role = body?.role === "broadcast" ? "broadcast" : "watch";
  if (!matchId) {
    return NextResponse.json({ error: "matchId manquant." }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const { data: match } = await supabase
    .from("basketball_matches")
    .select("id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) {
    return NextResponse.json({ error: "Match introuvable." }, { status: 404 });
  }

  const roomName = `match-${match.id}`;
  const suffix = Math.random().toString(36).slice(2, 8);
  const at = new AccessToken(apiKey, apiSecret, {
    identity: `${role}-${user.id.slice(0, 8)}-${suffix}`,
    ttl: "4h",
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: role === "broadcast",
    canPublishData: false,
    canSubscribe: role === "watch",
  });

  return NextResponse.json({ token: await at.toJwt(), url, room: roomName });
}
