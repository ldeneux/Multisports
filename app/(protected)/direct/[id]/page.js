import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import ReplayPlayer from "@/components/ReplayPlayer";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { updateVideo, setLive, deleteVideo, addMoment, deleteMoment } from "../actions";

export const dynamic = "force-dynamic";

const input = "rounded-lg border border-ink/15 px-3 py-2";

export default async function VideoPage({ params }) {
  const supabase = createClient();

  const { data: video } = await supabase
    .from("videos")
    .select("*, participants(first_name), sports(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!video) notFound();

  const [{ data: moments }, { data: participants }, { data: sports }] = await Promise.all([
    supabase.from("video_moments").select("*").eq("video_id", video.id).order("start_sec"),
    supabase.from("participants").select("id, first_name").order("birthdate"),
    supabase.from("sports").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/direct" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/50 hover:text-navy">
        <ArrowLeft size={16} /> Direct &amp; replays
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl uppercase tracking-tight text-navy">{video.title}</h1>
          {video.is_live && <span className="rounded-full bg-cardinal px-3 py-1 text-xs font-bold uppercase text-white">En direct</span>}
        </div>
        <p className="mt-1 text-sm text-ink/50">
          {[video.participants?.first_name, video.sports?.name, video.event_date && formatDate(video.event_date, { weekday: false })]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {video.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-ink/60">{video.notes}</p>}
      </div>

      <ReplayPlayer video={video} moments={moments ?? []} addMoment={addMoment} deleteMoment={deleteMoment} />

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <form action={setLive}>
          <input type="hidden" name="id" value={video.id} />
          <input type="hidden" name="live" value={video.is_live ? "false" : "true"} />
          <button type="submit" className="rounded-full bg-sand px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-lagoon-light">
            {video.is_live ? "Terminer le direct (passer en replay)" : "Marquer comme direct en cours"}
          </button>
        </form>
        {video.url && video.source !== "file" && (
          <a href={video.url} target="_blank" rel="noreferrer" className="font-semibold text-navy hover:underline">
            Ouvrir sur le site d'origine
          </a>
        )}
      </div>

      <details className="rounded-card bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-display text-sm uppercase tracking-tight text-navy">Modifier la vidéo</summary>
        <form action={updateVideo} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={video.id} />
          <input name="title" required defaultValue={video.title} className={`${input} sm:col-span-2`} />
          <select name="participant_id" defaultValue={video.participant_id ?? ""} className={input}>
            <option value="">Qui ? (optionnel)</option>
            {(participants ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.first_name}</option>
            ))}
          </select>
          <select name="sport_id" defaultValue={video.sport_id ?? ""} className={input}>
            <option value="">Sport (optionnel)</option>
            {(sports ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <label className="text-xs font-semibold text-ink/60">
            Date
            <input type="date" name="event_date" defaultValue={video.event_date ?? ""} className={`mt-1 w-full ${input}`} />
          </label>
          {video.source !== "file" && (
            <label className="text-xs font-semibold text-ink/60">
              Lien
              <input name="url" defaultValue={video.url ?? ""} className={`mt-1 w-full ${input}`} />
            </label>
          )}
          <textarea name="notes" rows={2} defaultValue={video.notes ?? ""} placeholder="Notes" className={`${input} sm:col-span-2`} />
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" className="rounded-full bg-navy px-5 py-2 font-semibold text-white hover:bg-navy-light">
              Mettre à jour
            </button>
            <ConfirmSubmitButton
              formAction={deleteVideo}
              confirmMessage="Supprimer cette vidéo et tous ses passages ? Le fichier envoyé est effacé aussi (un lien YouTube reste sur YouTube)."
              className="rounded-full px-4 py-2 text-sm font-semibold text-ink/40 hover:text-cardinal"
            >
              Supprimer la vidéo
            </ConfirmSubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}
