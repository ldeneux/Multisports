// Graphiques "maison" en SVG pur, sans dépendance externe (recharts, d3...)
// pour rester cohérent avec le reste de l'appli (aucun autre écran n'a de
// dépendance de ce type). Tous ces composants sont statiques, entièrement
// rendus côté serveur — pas de "use client" nécessaire. Chaque barre porte
// sa valeur en toutes lettres au-dessus (lisible sans interaction, y compris
// au doigt sur mobile) ainsi qu'un <title> natif pour l'infobulle au survol
// à la souris — aucun JS n'est nécessaire pour l'un ou l'autre.

function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const residual = value / magnitude;
  let niceResidual;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 5) niceResidual = 5;
  else niceResidual = 10;
  return niceResidual * magnitude;
}

function formatTick(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function polarPoint(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

// Radar de profil (5 axes typiquement). Chaque axe attend une `value` déjà
// ramenée sur une échelle 0-100 par l'appelant — ce composant ne fait aucune
// pondération lui-même, il se contente d'afficher ce qu'on lui donne.
export function RadarChart({ axes, size = 260 }) {
  if (!axes || axes.length < 3) return null;
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 40;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;
  const levels = [0.25, 0.5, 0.75, 1];

  const points = axes.map((a, i) => {
    const angle = startAngle + i * angleStep;
    const r = (Math.max(0, Math.min(100, a.value)) / 100) * maxR;
    return polarPoint(cx, cy, r, angle);
  });
  const polygonPoints = points.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-xs">
      {levels.map((lvl) => (
        <polygon
          key={lvl}
          points={axes
            .map((_, i) => polarPoint(cx, cy, maxR * lvl, startAngle + i * angleStep).join(","))
            .join(" ")}
          className="fill-none stroke-ink/10"
        />
      ))}
      {axes.map((a, i) => {
        const [x, y] = polarPoint(cx, cy, maxR, startAngle + i * angleStep);
        return <line key={a.label} x1={cx} y1={cy} x2={x} y2={y} className="stroke-ink/10" />;
      })}
      <polygon points={polygonPoints} className="fill-[#2E86DE]/25 stroke-[#2E86DE]" strokeWidth="2" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" className="fill-[#2E86DE]">
          <title>{`${axes[i].label} : ${Math.round(axes[i].value)}/100`}</title>
        </circle>
      ))}
      {axes.map((a, i) => {
        const [x, y] = polarPoint(cx, cy, maxR + 24, startAngle + i * angleStep);
        return (
          <text
            key={a.label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-ink/60 text-[9px] font-semibold"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

// Grille de fond commune aux graphiques en barres verticales : 3 lignes
// horizontales (0 / milieu / max) avec leur valeur affichée à gauche, sur la
// zone de dessin qui commence à `leftMargin` (pour laisser la place aux
// nombres) et se termine à `baseline` (pour laisser la place aux libellés du
// bas). Rendu une seule fois, partagé par StackedBarChart et SimpleBarChart.
function VerticalGridlines({ width, leftMargin, top, baseline, max }) {
  const levels = [0, 0.5, 1];
  return (
    <>
      {levels.map((lvl) => {
        const y = baseline - lvl * (baseline - top);
        return (
          <g key={lvl}>
            <line x1={leftMargin} y1={y} x2={width} y2={y} className={lvl === 0 ? "stroke-ink/20" : "stroke-ink/8"} />
            <text x={leftMargin - 4} y={y} textAnchor="end" dominantBaseline="middle" className="fill-ink/40 text-[8px]">
              {formatTick(max * lvl)}
            </text>
          </g>
        );
      })}
    </>
  );
}

// Barres empilées (ex. points 2pts/3pts/LF marqués, match après match). La
// légende est affichée AU-DESSUS du graphique (juste en dessous du titre
// donné par l'appelant) pour rester visuellement collée à ce qu'elle
// explique, plutôt que détachée dessous. `stripItems` (optionnel) ajoute une
// fine bande de petits carrés colorés sous l'axe des dates — un repère
// compact (ex. régularité d'un match à l'autre) sans dupliquer un graphique
// entier : un item par entrée de `items`, `{ color, title }` ou `null` pour
// ne rien afficher sur cette colonne.
export function StackedBarChart({ items, legend, height = 190, stripItems }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const totals = items.map((it) => it.segments.reduce((s, seg) => s + seg.value, 0));
  const max = niceMax(Math.max(1, ...totals));
  const leftMargin = 22;
  const top = 14;
  const hasStrip = Array.isArray(stripItems) && stripItems.length === items.length;
  const baseline = height - 20;
  const svgHeight = hasStrip ? height + 16 : height;
  const width = Math.max(220, leftMargin + items.length * 40);
  const plotWidth = width - leftMargin;
  const slot = plotWidth / items.length;
  const barWidth = Math.min(28, slot - 10);

  return (
    <div>
      {legend && (
        <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-ink/60">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${l.className}`} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <svg width={width} height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`}>
          <VerticalGridlines width={width} leftMargin={leftMargin} top={top} baseline={baseline} max={max} />
          {items.map((it, i) => {
            const x = leftMargin + i * slot + (slot - barWidth) / 2;
            let yCursor = baseline;
            const total = it.segments.reduce((s, seg) => s + seg.value, 0);
            return (
              <g key={i}>
                {it.segments.map((seg, si) => {
                  const h = (seg.value / max) * (baseline - top);
                  yCursor -= h;
                  return (
                    <rect key={si} x={x} y={yCursor} width={barWidth} height={Math.max(0, h)} className={seg.className}>
                      <title>{`${it.label} — ${seg.label ?? ""} : ${seg.value}`}</title>
                    </rect>
                  );
                })}
                {total > 0 && (
                  <text x={x + barWidth / 2} y={yCursor - 4} textAnchor="middle" className="fill-ink text-[9px] font-semibold">
                    {total}
                  </text>
                )}
                <text x={x + barWidth / 2} y={baseline + 12} textAnchor="middle" className="fill-ink/40 text-[8px]">
                  {it.label}
                </text>
              </g>
            );
          })}
          {hasStrip &&
            items.map((it, i) => {
              const strip = stripItems[i];
              if (!strip) return null;
              const cx = leftMargin + i * slot + slot / 2;
              return (
                <rect
                  key={`strip-${i}`}
                  x={cx - 4}
                  y={baseline + 20}
                  width="8"
                  height="8"
                  rx="2"
                  fill={strip.color}
                >
                  <title>{strip.title ?? it.label}</title>
                </rect>
              );
            })}
        </svg>
      </div>
    </div>
  );
}

// Barres simples (ex. temps de jeu ou fautes, match après match), avec un
// seuil optionnel affiché en pointillés (ex. 5 fautes = sortie, ou 100% =
// objectif atteint). Chaque item peut fournir sa propre `className` pour
// une couleur par barre (ex. accentuer une sur/sous-performance) ; à défaut
// `colorClass` s'applique à toutes les barres.
export function SimpleBarChart({ items, height = 190, thresholdValue, thresholdLabel, colorClass = "fill-navy" }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const max = niceMax(Math.max(1, thresholdValue ?? 0, ...items.map((it) => it.value)));
  const leftMargin = 22;
  const top = 14;
  const baseline = height - 20;
  const width = Math.max(220, leftMargin + items.length * 40);
  const plotWidth = width - leftMargin;
  const slot = plotWidth / items.length;
  const barWidth = Math.min(28, slot - 10);
  const thresholdY = thresholdValue != null ? baseline - (thresholdValue / max) * (baseline - top) : null;

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <VerticalGridlines width={width} leftMargin={leftMargin} top={top} baseline={baseline} max={max} />
        {thresholdY != null && (
          <>
            <line x1={leftMargin} x2={width} y1={thresholdY} y2={thresholdY} className="stroke-cardinal/60" strokeDasharray="4 3" />
            <text x={width - 2} y={thresholdY - 3} textAnchor="end" className="fill-cardinal/70 text-[8px]">
              {thresholdLabel}
            </text>
          </>
        )}
        {items.map((it, i) => {
          const x = leftMargin + i * slot + (slot - barWidth) / 2;
          const h = (it.value / max) * (baseline - top);
          return (
            <g key={i}>
              <rect x={x} y={baseline - h} width={barWidth} height={Math.max(0, h)} className={it.className || colorClass}>
                <title>{`${it.label} : ${formatTick(it.value)}`}</title>
              </rect>
              {it.value > 0 && (
                <text x={x + barWidth / 2} y={baseline - h - 4} textAnchor="middle" className="fill-ink text-[9px] font-semibold">
                  {formatTick(it.value)}
                </text>
              )}
              <text x={x + barWidth / 2} y={baseline + 12} textAnchor="middle" className="fill-ink/40 text-[8px]">
                {it.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Barres + ligne superposée sur deux échelles (ex. fautes en barres, temps
// de jeu en ligne, pour juger le nombre de fautes AU REGARD du temps
// réellement passé sur le terrain plutôt qu'en valeur absolue). Les classes
// de couleur sont attendues en toutes lettres (fill-navy, stroke-navy,
// bg-navy...) plutôt que construites dynamiquement, pour que Tailwind les
// détecte à la compilation.
export function BarLineChart({
  items,
  barLabel,
  barColorClass = "fill-cardinal",
  lineLabel,
  lineStrokeClass = "stroke-navy",
  lineFillClass = "fill-navy",
  lineDotClass = "bg-navy",
  thresholdValue,
  thresholdLabel,
  height = 190,
}) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const barMax = niceMax(Math.max(1, thresholdValue ?? 0, ...items.map((it) => it.barValue)));
  const lineValues = items.map((it) => it.lineValue).filter((v) => v != null);
  const lineMax = niceMax(Math.max(1, ...lineValues));
  const leftMargin = 22;
  const rightMargin = 30;
  const top = 14;
  const baseline = height - 20;
  const width = Math.max(240, leftMargin + rightMargin + items.length * 40);
  const plotRight = width - rightMargin;
  const plotWidth = plotRight - leftMargin;
  const slot = plotWidth / items.length;
  const barWidth = Math.min(24, slot - 12);
  const thresholdY = thresholdValue != null ? baseline - (thresholdValue / barMax) * (baseline - top) : null;

  const linePoints = items.map((it, i) => ({
    x: leftMargin + i * slot + slot / 2,
    y: it.lineValue != null ? baseline - (it.lineValue / lineMax) * (baseline - top) : null,
    value: it.lineValue,
  }));
  const linePath = linePoints
    .filter((p) => p.y != null)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-ink/60">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${barColorClass.replace("fill-", "bg-")}`} />
          {barLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${lineDotClass}`} />
          {lineLabel}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <VerticalGridlines width={plotRight} leftMargin={leftMargin} top={top} baseline={baseline} max={barMax} />
          {[0, 0.5, 1].map((lvl) => (
            <text
              key={lvl}
              x={plotRight + 4}
              y={baseline - lvl * (baseline - top)}
              dominantBaseline="middle"
              className="fill-ink/40 text-[8px]"
            >
              {formatTick(lineMax * lvl)}
            </text>
          ))}
          {thresholdY != null && (
            <>
              <line x1={leftMargin} x2={plotRight} y1={thresholdY} y2={thresholdY} className="stroke-[#FF5A5F]/60" strokeDasharray="4 3" />
              <text x={plotRight} y={thresholdY - 3} textAnchor="end" className="fill-[#FF5A5F]/70 text-[8px]">
                {thresholdLabel}
              </text>
            </>
          )}
          {items.map((it, i) => {
            const x = leftMargin + i * slot + (slot - barWidth) / 2;
            const h = (it.barValue / barMax) * (baseline - top);
            return (
              <g key={i}>
                <rect x={x} y={baseline - h} width={barWidth} height={Math.max(0, h)} className={barColorClass}>
                  <title>{`${it.label} — ${barLabel} : ${formatTick(it.barValue)}`}</title>
                </rect>
                {it.barValue > 0 && (
                  <text x={x + barWidth / 2} y={baseline - h - 4} textAnchor="middle" className="fill-ink text-[9px] font-semibold">
                    {formatTick(it.barValue)}
                  </text>
                )}
                <text x={x + barWidth / 2} y={baseline + 12} textAnchor="middle" className="fill-ink/40 text-[8px]">
                  {it.label}
                </text>
              </g>
            );
          })}
          {linePath && <path d={linePath} className={`fill-none ${lineStrokeClass}`} strokeWidth="2" />}
          {linePoints.map((p, i) =>
            p.y != null ? (
              <circle key={i} cx={p.x} cy={p.y} r="3" className={lineFillClass}>
                <title>{`${items[i].label} — ${lineLabel} : ${formatTick(p.value)}`}</title>
              </circle>
            ) : null
          )}
        </svg>
      </div>
    </div>
  );
}

// Deux courbes sur UNE SEULE échelle partagée (contrairement à BarLineChart,
// qui a deux échelles séparées pour bar/ligne) — pour des séries directement
// comparables entre elles, ex. points d'une joueuse vs points totaux de son
// équipe, match après match. La série B (fond, pointillés) est pensée pour
// la référence d'équipe ; la série A (premier plan, trait plein et plus
// épais) pour la joueuse suivie.
export function DualLineChart({ items, seriesA, seriesB, height = 190 }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const allValues = items.flatMap((it) => [it.a, it.b]).filter((v) => v != null);
  const max = niceMax(Math.max(1, ...allValues));
  const leftMargin = 22;
  const top = 14;
  const baseline = height - 20;
  const width = Math.max(240, leftMargin + items.length * 40);
  const plotWidth = width - leftMargin;
  const slot = plotWidth / items.length;

  const buildLine = (key) => {
    const points = items.map((it, i) => ({
      x: leftMargin + i * slot + slot / 2,
      y: it[key] != null ? baseline - (it[key] / max) * (baseline - top) : null,
      value: it[key],
    }));
    const path = points
      .filter((p) => p.y != null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
    return { points, path };
  };

  const lineA = buildLine("a");
  const lineB = buildLine("b");

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-ink/60">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${seriesA.dotClass}`} />
          {seriesA.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${seriesB.dotClass}`} />
          {seriesB.label}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <VerticalGridlines width={width} leftMargin={leftMargin} top={top} baseline={baseline} max={max} />
          {items.map((it, i) => (
            <text
              key={i}
              x={leftMargin + i * slot + slot / 2}
              y={baseline + 12}
              textAnchor="middle"
              className="fill-ink/40 text-[8px]"
            >
              {it.label}
            </text>
          ))}
          {lineB.path && (
            <path d={lineB.path} className={`fill-none ${seriesB.strokeClass}`} strokeWidth="2" strokeDasharray="4 3" />
          )}
          {lineB.points.map((p, i) =>
            p.y != null ? (
              <circle key={`b${i}`} cx={p.x} cy={p.y} r="2.5" className={seriesB.fillClass}>
                <title>{`${items[i].label} — ${seriesB.label} : ${formatTick(p.value)}`}</title>
              </circle>
            ) : null
          )}
          {lineA.path && <path d={lineA.path} className={`fill-none ${seriesA.strokeClass}`} strokeWidth="2.5" />}
          {lineA.points.map((p, i) =>
            p.y != null ? (
              <circle key={`a${i}`} cx={p.x} cy={p.y} r="3.5" className={seriesA.fillClass}>
                <title>{`${items[i].label} — ${seriesA.label} : ${formatTick(p.value)}`}</title>
              </circle>
            ) : null
          )}
        </svg>
      </div>
    </div>
  );
}

// Palette vive dédiée à IsoBarChart/DonutChart — volontairement distincte du
// thème général de l'appli (navy/cardinal/lagoon), réservée à ces deux
// graphiques pour leur donner un rendu plus "graphique de données" moderne.
// Couleurs en dur (pas de classes Tailwind) car hors palette du design
// system : IsoBarChart calcule son ton (great/mid/low) à partir de la valeur
// elle-même, DonutChart prend une couleur explicite par segment.
const ISO_TIERS = {
  great: { base: "#16C79A", light: "#5EE7C0", dark: "#0E8F70" },
  mid: { base: "#2E86DE", light: "#6FB2F5", dark: "#1B5FA8" },
  low: { base: "#FF5A5F", light: "#FF9195", dark: "#C43A3E" },
};

// Camembert (donut) — pour une répartition figée (ex. part des points 2pts /
// 3pts / LF sur la saison), jamais pour une évolution dans le temps.
export function DonutChart({ segments, size = 170 }) {
  if (!segments || segments.length === 0 || segments.every((s) => s.value <= 0)) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const inner = r * 0.55;
  const rMid = (r + inner) / 2;
  const strokeW = r - inner;
  let angle = -Math.PI / 2;

  const arcs = segments
    .filter((seg) => seg.value > 0)
    .map((seg) => {
      const frac = seg.value / total;
      const startAngle = angle;
      const endAngle = angle + frac * 2 * Math.PI;
      angle = endAngle;
      const large = frac > 0.5 ? 1 : 0;
      const [x1, y1] = polarPoint(cx, cy, rMid, startAngle);
      const [x2, y2] = polarPoint(cx, cy, rMid, endAngle);
      return {
        ...seg,
        pct: Math.round(frac * 100),
        path: `M ${x1} ${y1} A ${rMid} ${rMid} 0 ${large} 1 ${x2} ${y2}`,
      };
    });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((a, i) => (
          <path key={i} d={a.path} fill="none" stroke={a.color} strokeWidth={strokeW} strokeLinecap="butt">
            <title>{`${a.label} : ${a.pct}%`}</title>
          </path>
        ))}
      </svg>
      <div className="flex flex-col gap-1.5 text-[11px] text-ink/60">
        {arcs.map((a, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
            {a.label} — {a.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

// Barres en fausse perspective isométrique (socle + 2 faces + dessus, 3 tons
// d'une même couleur) — la couleur suit AUTOMATIQUEMENT la valeur (vert-eau
// ≥100%, bleu 50-99%, corail <50%), pas une couleur fixe par barre : c'est ce
// qui permet de repérer un bon/mauvais match d'un coup d'œil, comme l'ancien
// SimpleBarChart avec ses classes de couleur, mais dans la palette vive.
export function IsoBarChart({ items, height = 220, thresholdValue, thresholdLabel }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const max = niceMax(Math.max(1, thresholdValue ?? 0, ...items.map((it) => it.value)));
  const leftMargin = 10;
  const top = 30;
  const baseline = height - 34;
  const width = Math.max(240, leftMargin + items.length * 56);
  const plotWidth = width - leftMargin;
  const slot = plotWidth / items.length;
  const s = 15;
  const thresholdY = thresholdValue != null ? baseline - (thresholdValue / max) * (baseline - top) : null;

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={leftMargin} x2={width} y1={baseline} y2={baseline} className="stroke-ink/15" />
        {thresholdY != null && (
          <>
            <line x1={leftMargin} x2={width} y1={thresholdY} y2={thresholdY} className="stroke-ink/25" strokeDasharray="4 3" />
            <text x={width - 2} y={thresholdY - 4} textAnchor="end" className="fill-ink/40 text-[8px]">
              {thresholdLabel}
            </text>
          </>
        )}
        {items.map((it, i) => {
          const cx = leftMargin + i * slot + slot / 2;
          const h = Math.max(2, (it.value / max) * (baseline - top));
          const tier = it.value >= 100 ? ISO_TIERS.great : it.value >= 50 ? ISO_TIERS.mid : ISO_TIERS.low;
          const A = { x: s * 0.866, y: s * 0.5 };
          const B = { x: -s * 0.866, y: s * 0.5 };
          const o = { x: cx, y: baseline };
          const oA = { x: o.x + A.x, y: o.y + A.y };
          const oB = { x: o.x + B.x, y: o.y + B.y };
          const oAB = { x: o.x + A.x + B.x, y: o.y + A.y + B.y };
          const topPt = { x: o.x, y: o.y - h };
          const topA = { x: oA.x, y: oA.y - h };
          const topB = { x: oB.x, y: oB.y - h };
          const topAB = { x: oAB.x, y: oAB.y - h };
          return (
            <g key={i}>
              <ellipse cx={cx} cy={baseline + 4} rx={s * 1.1} ry={s * 0.35} className="fill-ink/5" />
              <polygon points={`${o.x},${o.y} ${oB.x},${oB.y} ${topB.x},${topB.y} ${topPt.x},${topPt.y}`} fill={tier.base} />
              <polygon points={`${o.x},${o.y} ${oA.x},${oA.y} ${topA.x},${topA.y} ${topPt.x},${topPt.y}`} fill={tier.dark} />
              <polygon points={`${topPt.x},${topPt.y} ${topA.x},${topA.y} ${topAB.x},${topAB.y} ${topB.x},${topB.y}`} fill={tier.light}>
                <title>{`${it.label} : ${formatTick(it.value)}`}</title>
              </polygon>
              <text x={cx} y={topPt.y - 6} textAnchor="middle" className="fill-ink text-[9px] font-semibold">
                {formatTick(it.value)}
              </text>
              <text x={cx} y={baseline + 16} textAnchor="middle" className="fill-ink/40 text-[8px]">
                {it.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// "Pyramide des âges" détournée : deux séries dos à dos de part et d'autre
// d'un axe central (ex. note moyenne à domicile vs à l'extérieur, par
// joueuse) — utile uniquement pour comparer DEUX métriques sur les mêmes
// catégories, pas comme classement à une seule valeur (voir HorizontalBarChart
// pour ce cas-là).
export function PyramidChart({ items, leftLabel, rightLabel, leftColor = "#2E86DE", rightColor = "#16C79A", valueSuffix = "" }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const max = niceMax(Math.max(1, ...items.flatMap((it) => [it.left, it.right])));
  const rowHeight = 26;
  const top = 8;
  const height = items.length * rowHeight + top + 8;
  const labelWidth = 130;
  const halfWidth = 110;
  const centerX = labelWidth + halfWidth;
  const totalWidth = labelWidth + halfWidth * 2 + 56;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-ink/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: leftColor }} />
          {leftLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: rightColor }} />
          {rightLabel}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${totalWidth} ${height}`}>
        <line x1={centerX} y1={top} x2={centerX} y2={height - 4} className="stroke-ink/20" />
        {items.map((it, i) => {
          const y = top + i * rowHeight;
          const leftW = (it.left / max) * halfWidth;
          const rightW = (it.right / max) * halfWidth;
          return (
            <g key={it.label}>
              <text
                x={labelWidth - 6}
                y={y + rowHeight / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className={`text-[10px] ${it.highlight ? "fill-cardinal font-bold" : "fill-ink/60"}`}
              >
                {it.label}
              </text>
              <rect x={centerX - leftW} y={y + 3} width={Math.max(0, leftW)} height={rowHeight - 10} rx="2" fill={leftColor}>
                <title>{`${it.label} — ${leftLabel} : ${formatTick(it.left)}${valueSuffix}`}</title>
              </rect>
              <text x={centerX - leftW - 4} y={y + rowHeight / 2} textAnchor="end" dominantBaseline="middle" className="fill-ink/50 text-[9px]">
                {formatTick(it.left)}
                {valueSuffix}
              </text>
              <rect x={centerX} y={y + 3} width={Math.max(0, rightW)} height={rowHeight - 10} rx="2" fill={rightColor}>
                <title>{`${it.label} — ${rightLabel} : ${formatTick(it.right)}${valueSuffix}`}</title>
              </rect>
              <text x={centerX + rightW + 4} y={y + rowHeight / 2} dominantBaseline="middle" className="fill-ink/50 text-[9px]">
                {formatTick(it.right)}
                {valueSuffix}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Petite icône info dépliable (aucun JS — <details> natif), placée en bas de
// chaque carte de graphique pour expliquer la règle de calcul sans encombrer
// l'affichage par défaut.
export function ChartInfo({ children }) {
  return (
    <details className="mt-2">
      <summary
        className="inline-block cursor-pointer select-none text-xs text-ink/30 hover:text-ink/60"
        title="Comment ce graphique est calculé"
      >
        ⓘ
      </summary>
      <p className="mt-1 text-[11px] leading-relaxed text-ink/50">{children}</p>
    </details>
  );
}

// Barres horizontales (ex. classements entre joueuses) — la ligne mise en
// évidence (highlight) sert à repérer la joueuse actuellement sélectionnée
// dans un classement qui montre toute l'équipe. Graduation verticale en
// pointillés (0/50/100% du max) en plus de la valeur déjà affichée en toutes
// lettres au bout de chaque barre.
export function HorizontalBarChart({ items, valueSuffix = "" }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const max = niceMax(Math.max(1, ...items.map((it) => it.value)));
  const rowHeight = 26;
  const top = 14;
  const height = items.length * rowHeight + top + 4;
  const labelWidth = 92;
  const chartWidth = 300;
  const totalWidth = labelWidth + chartWidth + 60;
  const levels = [0, 0.5, 1];

  return (
    <svg width="100%" viewBox={`0 0 ${totalWidth} ${height}`}>
      {levels.map((lvl) => {
        const x = labelWidth + lvl * chartWidth;
        return (
          <g key={lvl}>
            <line
              x1={x}
              y1={top - 6}
              x2={x}
              y2={height - 4}
              className={lvl === 0 ? "stroke-ink/20" : "stroke-ink/8"}
              strokeDasharray={lvl === 0 ? undefined : "3 3"}
            />
            <text x={x} y={top - 8} textAnchor="middle" className="fill-ink/40 text-[8px]">
              {formatTick(max * lvl)}
              {valueSuffix}
            </text>
          </g>
        );
      })}
      {items.map((it, i) => {
        const y = top + i * rowHeight;
        const barW = (it.value / max) * chartWidth;
        return (
          <g key={it.label}>
            <text
              x={labelWidth - 6}
              y={y + rowHeight / 2}
              textAnchor="end"
              dominantBaseline="middle"
              className={`text-[10px] ${it.highlight ? "fill-cardinal font-bold" : "fill-ink/60"}`}
            >
              {it.label}
            </text>
            <rect
              x={labelWidth}
              y={y + 3}
              width={Math.max(0, barW)}
              height={rowHeight - 10}
              rx="3"
              className={it.highlight ? "fill-cardinal" : "fill-navy/70"}
            >
              <title>{`${it.label} : ${formatTick(it.value)}${valueSuffix}${it.sublabel ? ` (${it.sublabel})` : ""}`}</title>
            </rect>
            <text x={labelWidth + barW + 6} y={y + rowHeight / 2} dominantBaseline="middle" className="fill-ink/50 text-[10px]">
              {formatTick(it.value)}
              {valueSuffix}
              {it.sublabel ? ` (${it.sublabel})` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
