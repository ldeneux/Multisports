"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addChapter, addReplayGroup, deleteChapter, deleteGroup } from "@/app/(protected)/replays/actions";

const SPORTS = [
  { value: "basket", label: "Basket" },
  { value: "natation", label: "Natation" },
  { value: "autre", label: "Autre" },
];

const BASKET_CHAPTERS = ["1er quart-temps", "2e quart-temps", "3e quart-temps", "4e quart-temps"];

let rowCounter = 0;
const nextKey = () => `row-${++rowCounter}`;

const defaultRows = (sport) =>
  (sport === "basket" ? BASKET_CHAPTERS : [""]).map((label) => ({ key: nextKey(), label, url: "" }));

// Saison sportive : de septembre à août (ex. 15/04/2026 → 2025-2026).
function seasonFromDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function formatDay(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const inputClass = "w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm";

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-ink/60">{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Sélecteur de match : Saison → Équipe → Phase → Match, ou recherche par adversaire
// ---------------------------------------------------------------------------
const normalize = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const unique = (values) => [...new Set(values)];

function MatchPicker({ matches, value, onPick }) {
  const selected = matches.find((m) => m.id === value);
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState(selected?.season ?? "");
  const [psId, setPsId] = useState(selected?.psId ?? "");
  const [phaseId, setPhaseId] = useState(selected?.phaseId ?? "");

  // Chaque niveau retombe sur son premier choix si la sélection n'existe plus au niveau du dessus.
  const seasons = unique(matches.map((m) => m.season)).sort().reverse();
  const effSeason = seasons.includes(season) ? season : seasons[0] ?? "";
  const inSeason = matches.filter((m) => m.season === effSeason);

  const teams = unique(inSeason.map((m) => m.psId)).map((id) => {
    const m = inSeason.find((x) => x.psId === id);
    return { id, name: [m.who, m.team].filter(Boolean).join(" · ") || "Équipe" };
  });
  const effPs = teams.some((t) => t.id === psId) ? psId : teams[0]?.id ?? "";
  const inTeam = inSeason.filter((m) => m.psId === effPs);

  const phases = unique(inTeam.map((m) => m.phaseId))
    .map((id) => inTeam.find((x) => x.phaseId === id))
    .sort((a, b) => a.phasePos - b.phasePos)
    .map((m) => ({ id: m.phaseId, name: m.phaseName }));
  const effPhase = phases.some((ph) => ph.id === phaseId) ? phaseId : phases[0]?.id ?? "";
  const inPhase = inTeam.filter((m) => m.phaseId === effPhase);

  const q = normalize(query).trim();
  const results =
    q.length >= 2
      ? matches
          .filter((m) => normalize(m.opponent).includes(q))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 30)
      : [];

  const describe = (m) => [m.who, m.team, m.season && `saison ${m.season}`, m.phaseName].filter(Boolean).join(" · ");

  return (
    <div className="space-y-2 rounded-md border border-ink/10 p-3">
      <p className="text-xs font-semibold text-ink/60">Match du calendrier (remplit les infos ci-dessous)</p>

      {selected && (
        <div className="flex items-start justify-between gap-2 rounded-md bg-sand px-3 py-2 text-sm">
          <span>
            <span className="font-semibold text-navy">{selected.title}</span>
            <span className="block text-xs text-ink/50">
              {selected.shortDate} · {describe(selected)}
            </span>
          </span>
          <button type="button" onClick={() => onPick("")} className="text-xs font-semibold text-ink/40 hover:text-cardinal">
            Retirer
          </button>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un adversaire (ex. Lyon, Rillieux…)"
        className={inputClass}
      />

      {q.length >= 2 ? (
        <ul className="max-h-60 divide-y divide-ink/5 overflow-y-auto rounded-md border border-ink/10">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-ink/50">Aucun adversaire trouvé.</li>}
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(m.id);
                  setQuery("");
                  setSeason(m.season);
                  setPsId(m.psId);
                  setPhaseId(m.phaseId);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-sand"
              >
                <span className="text-sm font-semibold text-navy">
                  {m.shortDate} · {m.opponent} ({m.home ? "dom." : "ext."})
                </span>
                <span className="block text-xs text-ink/50">{describe(m)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Saison">
            <select value={effSeason} onChange={(e) => setSeason(e.target.value)} className={inputClass}>
              {seasons.map((s) => (
                <option key={s || "none"} value={s}>
                  {s || "Sans saison"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Équipe">
            <select value={effPs} onChange={(e) => setPsId(e.target.value)} className={inputClass}>
              {teams.map((t) => (
                <option key={t.id || "none"} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phase">
            <select value={effPhase} onChange={(e) => setPhaseId(e.target.value)} className={inputClass}>
              {phases.map((ph) => (
                <option key={ph.id || "none"} value={ph.id}>
                  {ph.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Match">
            <select
              value={inPhase.some((m) => m.id === value) ? value : ""}
              onChange={(e) => onPick(e.target.value)}
              className={inputClass}
            >
              <option value="">— choisir —</option>
              {inPhase.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.shortDate.slice(0, 5)} · {m.opponent} ({m.home ? "dom." : "ext."})
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulaire : un match / une compétition + ses chapitres
// ---------------------------------------------------------------------------
export function ReplayForm({ matches, defaultMatchId, startOpen }) {
  const router = useRouter();
  const initial = matches.find((m) => m.id === defaultMatchId);

  const [sport, setSport] = useState("basket");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [recordedOn, setRecordedOn] = useState(initial?.date ?? "");
  const [season, setSeason] = useState(initial?.season || seasonFromDate(initial?.date ?? ""));
  const [seasonAuto, setSeasonAuto] = useState(!initial?.season);
  const [team, setTeam] = useState(initial?.team ?? "");
  const [division, setDivision] = useState(initial?.division ?? "");
  const [matchId, setMatchId] = useState(initial?.id ?? "");
  const [rows, setRows] = useState(() => defaultRows("basket"));
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function pickMatch(id) {
    setMatchId(id);
    const m = matches.find((x) => x.id === id);
    if (!m) return;
    setTitle(m.title);
    setRecordedOn(m.date);
    setSeason(m.season || seasonFromDate(m.date));
    setSeasonAuto(!m.season);
    setDivision(m.division);
    if (m.team) setTeam(m.team);
  }

  function changeDate(value) {
    setRecordedOn(value);
    if (seasonAuto) setSeason(seasonFromDate(value));
  }

  function changeSport(value) {
    setSport(value);
    if (value !== "basket") setMatchId("");
    // On ne remplace les lignes de chapitres que si rien n'a encore été collé.
    if (rows.every((r) => !r.url.trim())) setRows(defaultRows(value));
  }

  const updateRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
  const addRow = () => setRows((rs) => [...rs, { key: nextKey(), label: "", url: "" }]);

  function reset() {
    setSport("basket");
    setTitle("");
    setRecordedOn("");
    setSeason("");
    setSeasonAuto(true);
    setTeam("");
    setDivision("");
    setMatchId("");
    setRows(defaultRows("basket"));
  }

  function onSubmit(e) {
    e.preventDefault();
    setError("");
    setDone(false);
    startTransition(async () => {
      const res = await addReplayGroup({
        title,
        sport,
        recorded_on: recordedOn,
        season,
        team,
        division,
        match_id: matchId,
        chapters: rows.map(({ label, url }) => ({ label, url })),
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      reset();
      setDone(true);
      router.refresh();
    });
  }

  return (
    <details open={startOpen} className="rounded-card bg-white p-4 shadow-sm">
      <summary className="cursor-pointer font-display text-base font-bold text-navy">Ajouter un replay</summary>
      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sport">
            <select value={sport} onChange={(e) => changeSport(e.target.value)} className={inputClass}>
              {SPORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={recordedOn} onChange={(e) => changeDate(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {sport === "basket" && <MatchPicker matches={matches} value={matchId} onPick={pickMatch} />}

        <Field label="Titre">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={sport === "natation" ? "Meeting de Rillieux" : "Sathonay – Lyon SO"}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Saison">
            <input
              value={season}
              onChange={(e) => {
                setSeason(e.target.value);
                setSeasonAuto(false);
              }}
              placeholder="2025-2026"
              className={inputClass}
            />
          </Field>
          <Field label="Équipe / catégorie">
            <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="U15" className={inputClass} />
          </Field>
        </div>
        <Field label="Division / niveau (facultatif)">
          <input value={division} onChange={(e) => setDivision(e.target.value)} className={inputClass} />
        </Field>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink/60">Chapitres (une vidéo chacun, les lignes vides sont ignorées)</p>
          {rows.map((r, i) => (
            <div key={r.key} className="flex gap-2">
              <input
                value={r.label}
                onChange={(e) => updateRow(r.key, { label: e.target.value })}
                placeholder={sport === "natation" ? "50 m NL" : `Chapitre ${i + 1}`}
                className={`${inputClass} w-2/5`}
              />
              <input
                value={r.url}
                onChange={(e) => updateRow(r.key, { url: e.target.value })}
                placeholder="Lien YouTube ou Drive"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removeRow(r.key)}
                aria-label="Retirer ce chapitre"
                className="px-1 text-ink/40 hover:text-cardinal"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="text-sm font-semibold text-lagoon hover:underline">
            + Ajouter un chapitre
          </button>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-cardinal px-5 py-2 text-sm font-bold text-white hover:bg-cardinal-dark disabled:opacity-60"
        >
          {pending ? "Ajout…" : "Enregistrer le replay"}
        </button>
        {error && <p className="text-sm text-cardinal-dark">{error}</p>}
        {done && <p className="text-sm text-lagoon">Replay ajouté.</p>}
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Liste : une carte par match / compétition
// ---------------------------------------------------------------------------
export function ReplayList({ groups }) {
  const [filter, setFilter] = useState("tous");
  const shown = groups.filter((g) => filter === "tous" || g.sport === filter);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[["tous", "Tous"], ...SPORTS.map((s) => [s.value, s.label])].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              filter === value ? "bg-navy text-white" : "bg-white text-ink/60 shadow-sm"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="rounded-card bg-white p-4 text-sm text-ink/60 shadow-sm">Aucun replay pour l'instant.</p>
      )}
      {shown.map((g) => (
        <GroupCard key={g.id} g={g} />
      ))}
    </div>
  );
}

function Frame({ src, title }) {
  return (
    <iframe
      src={src}
      title={title}
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      loading="lazy"
      className="aspect-video w-full rounded-md bg-black"
    />
  );
}

function GroupCard({ g }) {
  const router = useRouter();
  // null | { mode: "one", id } | { mode: "all", index }
  const [player, setPlayer] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const playable = g.chapters.filter((c) => c.embed);
  const allYoutube = playable.length > 0 && playable.every((c) => c.provider === "youtube");
  const info = [formatDay(g.recordedOn), g.season && `Saison ${g.season}`, g.team, g.division]
    .filter(Boolean)
    .join(" · ");

  function run(action, after) {
    setError("");
    startTransition(async () => {
      const res = await action();
      if (res?.error) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function renderPlayer() {
    if (!player) return null;
    if (player.mode === "one") {
      const c = g.chapters.find((x) => x.id === player.id);
      return c?.embed ? <Frame key={c.id} src={c.embed} title={`${g.title} – ${c.label}`} /> : null;
    }
    if (allYoutube) {
      const ids = playable.map((c) => c.ref);
      const src =
        `https://www.youtube-nocookie.com/embed/${ids[0]}` + (ids.length > 1 ? `?playlist=${ids.slice(1).join(",")}` : "");
      return (
        <div className="space-y-1">
          <Frame key="all" src={src} title={g.title} />
          <p className="text-xs text-ink/50">Les {ids.length} chapitres s'enchaînent automatiquement.</p>
        </div>
      );
    }
    const i = Math.min(player.index, playable.length - 1);
    const c = playable[i];
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-navy">
          Chapitre {i + 1}/{playable.length} · {c.label}
        </p>
        <Frame key={c.id} src={c.embed} title={`${g.title} – ${c.label}`} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={i === 0}
            onClick={() => setPlayer({ mode: "all", index: i - 1 })}
            className="rounded-full bg-sand px-3 py-1 text-xs font-bold text-navy disabled:opacity-40"
          >
            ◀ Précédent
          </button>
          <button
            type="button"
            disabled={i === playable.length - 1}
            onClick={() => setPlayer({ mode: "all", index: i + 1 })}
            className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            Suivant ▶
          </button>
        </div>
        <p className="text-xs text-ink/50">
          Avec Google Drive, le passage au chapitre suivant se fait avec le bouton (pas d'enchaînement automatique).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-card bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-navy">{g.title}</h2>
          {info && <p className="text-xs text-ink/50">{info}</p>}
        </div>
        {playable.length > 0 && (
          <button
            type="button"
            onClick={() => setPlayer(player?.mode === "all" ? null : { mode: "all", index: 0 })}
            className="shrink-0 rounded-full bg-cardinal px-4 py-1.5 text-xs font-bold text-white hover:bg-cardinal-dark"
          >
            {player?.mode === "all" ? "Fermer" : "▶ Tout lire"}
          </button>
        )}
      </div>

      {renderPlayer()}

      {g.chapters.length === 0 ? (
        <p className="text-sm text-ink/60">Aucun chapitre pour l'instant.</p>
      ) : (
        <ul className="divide-y divide-ink/5">
          {g.chapters.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1 text-sm font-semibold text-navy">{c.label}</span>
              {c.embed && (
                <button
                  type="button"
                  onClick={() =>
                    setPlayer(player?.mode === "one" && player.id === c.id ? null : { mode: "one", id: c.id })
                  }
                  className="text-sm font-semibold text-lagoon hover:underline"
                >
                  {player?.mode === "one" && player.id === c.id ? "Fermer" : "Regarder"}
                </button>
              )}
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-lagoon hover:underline"
              >
                Ouvrir
              </a>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Retirer le chapitre « ${c.label} » ? (la vidéo reste sur YouTube / Drive)`)) {
                    run(() => deleteChapter(c.id));
                  }
                }}
                className="text-xs font-semibold text-ink/40 hover:text-cardinal"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-wrap gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Nom du chapitre"
            className={`${inputClass} w-full sm:w-1/3`}
          />
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Lien YouTube ou Drive"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button
            type="button"
            disabled={pending || !newUrl.trim()}
            onClick={() =>
              run(
                () => addChapter(g.id, { label: newLabel, url: newUrl }),
                () => {
                  setNewLabel("");
                  setNewUrl("");
                  setAdding(false);
                }
              )
            }
            className="rounded-full bg-navy px-4 py-2 text-xs font-bold text-white hover:bg-navy-light disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setAdding(true)} className="text-sm font-semibold text-lagoon hover:underline">
            + Ajouter un chapitre
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Supprimer « ${g.title} » et tous ses chapitres ? (les vidéos restent sur YouTube / Drive)`)) {
                run(() => deleteGroup(g.id));
              }
            }}
            className="text-xs font-semibold text-ink/40 hover:text-cardinal"
          >
            Supprimer ce replay
          </button>
        </div>
      )}
      {error && <p className="text-sm text-cardinal-dark">{error}</p>}
    </div>
  );
}
