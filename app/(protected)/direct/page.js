import Link from "next/link";
import { Radio, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { youtubeThumb } from "@/lib/video";
import { addVideo, setLive } from "./actions";

export const dynamic = "force-dynamic";

const input = "rounded-lg border border-ink/15 px-3 py-2";

function Thumb({ video }) {
  if (video.source === "youtube" && video.youtube_id) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={youtubeThumb(video.youtube_id)} alt="" className="aspect-video w-full object-cover" />;
  }
  if (video.source === "file" && video.url) {
    return <video src={`${video.url}#t=0.5`} preload="metadata" muted playsInline className="aspect-video w-full bg-black object-cover" />;
  }
  return <div className="aspect-video w-full bg-navy" />;
}

function VideoCard({ video }) {
  const momentCount = video.video_moments?.[0]?.count ?? 0;
  return (
    <Link href={`/direct/${video.id}`} className="group block overflow-hidden rounded-card bg-white shadow-sm hover:shadow-md">
      <div className="relative">
        <Thumb video={video} />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
          <Play size={40} />
        </span>
        {video.is_live && (
          <span className="absolute left-2 top-2 rounded-full bg-cardinal px-2.5 py-0.5 text-xs font-bold uppercase text-white">
            Direct
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold text-ink">{video.title}</p>
        <p className="mt-0.5 text-xs text-ink/50">
          {[video.participants?.first_name, video.sports?.name, video.event_date && formatDate(video.event_date, { weekday: false })]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {momentCount > 0 && (
          <p className="mt-1 text-xs font-semibold text-lagoon">
            {momentCount} passage{momentCount > 1 ? "s" : ""} à revoir en boucle
          </p>
        )}
      </div>
    </Link>
  );
}

export default async function DirectPage({ searchParams }) {
  const supabase = createClient();

  const [{ data: participants }, { data: sports }] = await Promise.all([
    supabase.from("participants").select("id, first_name").order("birthdate"),
    supabase.from("sports").select("id, name").order("name"),
  ]);

  const selectedParticipantId = (participants ?? []).find((p) => p.id === searchParams?.participant)?.id ?? null;

  let query = supabase
    .from("videos")
    .select("*, participants(first_name), sports(name), video_moments(count)")
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (selectedParticipantId) query = query.eq("participant_id", selectedParticipantId);

  const { data: videosRaw, error } = await query;
  const videos = videosRaw ?? [];
  const live = videos.filter((v) => v.is_live);
  const replays = videos.filter((v) => !v.is_live);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-navy">Direct &amp; replays</h1>
        <p className="mt-1 text-ink/60">
          Suis un match ou une course en direct, puis retrouve-les ici pour les revoir, en boucle et au ralenti.
        </p>
      </div>

      {error && (
        <p className="rounded-card bg-cardinal-light p-4 text-sm text-cardinal-dark">
          Impossible de lire les vidéos : {error.message}. As-tu exécuté le script <code>supabase/7-direct-replays.sql</code> ?
        </p>
      )}

      {/* Directs en cours */}
      {live.map((v) => (
        <section key={v.id} className="space-y-3 rounded-card bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-cardinal px-3 py-1 text-xs font-bold uppercase text-white">
              <Radio size={14} /> En direct
            </span>
            <h2 className="font-display text-lg tracking-tight text-navy">{v.title}</h2>
            <span className="text-sm text-ink/50">
              {[v.participants?.first_name, v.sports?.name].filter(Boolean).join(" · ")}
            </span>
          </div>

          {v.source === "youtube" && v.youtube_id ? (
            <div className="aspect-video w-full overflow-hidden rounded-card bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${v.youtube_id}?autoplay=1&mute=1&rel=0&playsinline=1`}
                title={v.title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          ) : v.url ? (
            <a href={v.url} target="_blank" rel="noreferrer" className="inline-block rounded-full bg-navy px-5 py-2 font-semibold text-white">
              Ouvrir le direct
            </a>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={`/direct/${v.id}`} className="font-semibold text-navy hover:underline">
              Ouvrir la page de la vidéo
            </Link>
            <form action={setLive}>
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="live" value="false" />
              <button type="submit" className="rounded-full bg-sand px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-lagoon-light">
                Terminer le direct (passer en replay)
              </button>
            </form>
          </div>
        </section>
      ))}

      {/* Ajouter */}
      <details className="rounded-card bg-white p-4 shadow-sm" open={videos.length === 0}>
        <summary className="cursor-pointer font-display text-sm uppercase tracking-tight text-navy">
          Ajouter un direct ou un replay
        </summary>
        <form action={addVideo} encType="multipart/form-data" className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="title" required placeholder="Titre (ex. Match contre Rennes, 100 m dos)" className={`${input} sm:col-span-2`} />

          <select name="participant_id" defaultValue={selectedParticipantId ?? ""} className={input}>
            <option value="">Qui ? (optionnel)</option>
            {(participants ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.first_name}</option>
            ))}
          </select>
          <select name="sport_id" defaultValue="" className={input}>
            <option value="">Sport (optionnel)</option>
            {(sports ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <label className="text-xs font-semibold text-ink/60">
            Date
            <input type="date" name="event_date" className={`mt-1 w-full ${input}`} />
          </label>
          <label className="flex items-center gap-2 pt-5 text-sm font-semibold text-ink/70">
            <input type="checkbox" name="is_live" className="h-4 w-4 rounded border-ink/30" />
            C'est un direct en cours
          </label>

          <input name="url" placeholder="Lien YouTube (direct ou replay)" className={`${input} sm:col-span-2`} />
          <label className="text-xs font-semibold text-ink/60 sm:col-span-2">
            …ou un fichier vidéo (extrait court, 50 Mo maximum)
            <input type="file" name="video" accept="video/*" className={`mt-1 w-full ${input}`} />
          </label>

          <textarea name="notes" rows={2} placeholder="Notes (optionnel)" className={`${input} sm:col-span-2`} />
          <button type="submit" className="rounded-full bg-cardinal px-5 py-2 font-semibold text-white hover:bg-cardinal-dark sm:col-span-2 sm:w-fit">
            Enregistrer
          </button>
        </form>
      </details>

      <details className="rounded-card bg-white p-4 text-sm text-ink/70 shadow-sm">
        <summary className="cursor-pointer font-display text-sm uppercase tracking-tight text-navy">
          Comment faire un direct depuis le téléphone ?
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Ouvre l'application YouTube, appuie sur « + » puis « Direct » (la première fois, YouTube peut demander de vérifier la chaîne).</li>
          <li>Choisis la visibilité <strong>« Non répertoriée »</strong> : seules les personnes qui ont le lien peuvent regarder.</li>
          <li>Pose le téléphone sur un trépied, en mode paysage, et lance le direct. Teste le réseau avant le match.</li>
          <li>Copie le lien du direct, envoie-le à l'autre parent, puis colle-le ici avec « C'est un direct en cours ».</li>
          <li>À la fin, appuie sur « Terminer le direct » : le même lien devient le replay (YouTube met parfois quelques minutes à le préparer).</li>
        </ol>
        <p className="mt-3 text-xs text-ink/50">
          Il y a toujours un décalage de 5 à 20 secondes avec la salle. Pour un simple extrait de course, tu peux aussi envoyer
          directement le fichier vidéo (50 Mo maximum).
        </p>
      </details>

      {/* Replays */}
      {(participants ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/direct"
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${!selectedParticipantId ? "bg-cardinal text-white" : "bg-white text-ink/60"}`}
          >
            Tous
          </Link>
          {participants.map((p) => (
            <Link
              key={p.id}
              href={`/direct?participant=${p.id}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${p.id === selectedParticipantId ? "bg-cardinal text-white" : "bg-white text-ink/60"}`}
            >
              {p.first_name}
            </Link>
          ))}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {replays.length === 0 ? (
          <p className="rounded-card bg-white p-6 text-sm text-ink/50 shadow-sm sm:col-span-2 lg:col-span-3">
            Aucun replay pour l'instant. Ajoute le lien d'un match ou d'une course ci-dessus.
          </p>
        ) : (
          replays.map((v) => <VideoCard key={v.id} video={v} />)
        )}
      </section>
    </div>
  );
}
