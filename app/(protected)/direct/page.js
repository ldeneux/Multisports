import { liveStreamId, muxConfigured, muxFetch } from "@/lib/mux";
import { BroadcastPanel, CreateStreamCard, LivePlayer, ReplayList } from "@/components/DirectClient";

export const dynamic = "force-dynamic";

export default async function DirectPage() {
  const id = liveStreamId();

  if (!muxConfigured()) {
    return (
      <Shell>
        <div className="rounded-card bg-white p-4 text-sm text-ink/70 shadow-sm">
          <p className="font-semibold text-navy">Mux n'est pas encore configuré.</p>
          <p className="mt-2">
            Ajoute <code>MUX_TOKEN_ID</code> et <code>MUX_TOKEN_SECRET</code> dans les variables d'environnement Vercel
            (jeton créé dans Mux : Settings → API Access Tokens, permission « Mux Video » en lecture et écriture), puis
            redéploie.
          </p>
        </div>
      </Shell>
    );
  }

  if (!id) {
    return (
      <Shell>
        <CreateStreamCard />
      </Shell>
    );
  }

  let stream = null;
  let replays = [];
  let error = "";
  try {
    stream = await muxFetch(`/video/v1/live-streams/${id}`);
    const assets = (await muxFetch("/video/v1/assets?limit=100")) ?? [];
    replays = assets
      .filter((a) => a.live_stream_id === id && !a.is_live && a.status === "ready" && a.playback_ids?.length)
      .map((a) => ({
        id: a.id,
        playbackId: a.playback_ids[0].id,
        createdAt: Number(a.created_at) * 1000,
        duration: Math.round(a.duration ?? 0),
      }))
      .sort((x, y) => y.createdAt - x.createdAt);
  } catch (e) {
    error = String(e?.message || e);
  }

  return (
    <Shell>
      {error && <p className="rounded-card bg-cardinal-light p-3 text-sm text-cardinal-dark">{error}</p>}
      {stream && (
        <LivePlayer playbackId={stream.playback_ids?.[0]?.id ?? ""} initialActive={stream.status === "active"} />
      )}
      <BroadcastPanel />
      <ReplayList replays={replays} />
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-navy">Direct et replays</h1>
      {children}
    </div>
  );
}
