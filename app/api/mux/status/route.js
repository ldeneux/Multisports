import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { liveStreamId, muxConfigured, muxFetch } from "@/lib/mux";

export const dynamic = "force-dynamic";

// Dit si un direct est en cours (interrogé toutes les 15 s par la page /direct).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!muxConfigured() || !liveStreamId()) return NextResponse.json({ active: false });
  try {
    const stream = await muxFetch(`/video/v1/live-streams/${liveStreamId()}`);
    return NextResponse.json({ active: stream?.status === "active" });
  } catch {
    return NextResponse.json({ active: false });
  }
}
