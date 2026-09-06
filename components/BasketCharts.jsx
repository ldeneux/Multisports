// Graphiques "maison" en SVG pur, sans dépendance externe (recharts, d3...)
// pour rester cohérent avec le reste de l'appli (aucun autre écran n'a de
// dépendance de ce type). Tous ces composants sont statiques, entièrement
// rendus côté serveur — pas de "use client" nécessaire.

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
      <polygon points={polygonPoints} className="fill-cardinal/25 stroke-cardinal" strokeWidth="2" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" className="fill-cardinal" />
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

// Barres empilées (ex. points 2pts/3pts/LF marqués, match après match).
export function StackedBarChart({ items, legend, height = 170 }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const totals = items.map((it) => it.segments.reduce((s, seg) => s + seg.value, 0));
  const max = niceMax(Math.max(1, ...totals));
  const width = Math.max(280, items.length * 34);
  const slot = width / items.length;
  const barWidth = Math.min(26, slot - 8);
  const baseline = height - 20;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: width }}>
        <line x1="0" y1={baseline} x2={width} y2={baseline} className="stroke-ink/15" />
        {items.map((it, i) => {
          const x = i * slot + (slot - barWidth) / 2;
          let yCursor = baseline;
          return (
            <g key={i}>
              {it.segments.map((seg, si) => {
                const h = (seg.value / max) * (baseline - 16);
                yCursor -= h;
                return (
                  <rect key={si} x={x} y={yCursor} width={barWidth} height={Math.max(0, h)} className={seg.className} />
                );
              })}
              <text x={x + barWidth / 2} y={baseline + 12} textAnchor="middle" className="fill-ink/40 text-[8px]">
                {it.label}
              </text>
            </g>
          );
        })}
      </svg>
      {legend && (
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-ink/50">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${l.className}`} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Barres simples (ex. temps de jeu ou fautes, match après match), avec un
// seuil optionnel affiché en pointillés (ex. 5 fautes = sortie).
export function SimpleBarChart({ items, height = 170, thresholdValue, thresholdLabel, colorClass = "fill-navy" }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const max = niceMax(Math.max(1, thresholdValue ?? 0, ...items.map((it) => it.value)));
  const width = Math.max(280, items.length * 34);
  const slot = width / items.length;
  const barWidth = Math.min(26, slot - 8);
  const baseline = height - 20;
  const thresholdY = thresholdValue != null ? baseline - (thresholdValue / max) * (baseline - 16) : null;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: width }}>
        <line x1="0" y1={baseline} x2={width} y2={baseline} className="stroke-ink/15" />
        {thresholdY != null && (
          <>
            <line x1="0" x2={width} y1={thresholdY} y2={thresholdY} className="stroke-cardinal/60" strokeDasharray="4 3" />
            <text x={width - 2} y={thresholdY - 3} textAnchor="end" className="fill-cardinal/70 text-[8px]">
              {thresholdLabel}
            </text>
          </>
        )}
        {items.map((it, i) => {
          const x = i * slot + (slot - barWidth) / 2;
          const h = (it.value / max) * (baseline - 16);
          return (
            <g key={i}>
              <rect x={x} y={baseline - h} width={barWidth} height={Math.max(0, h)} className={colorClass} />
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

// Barres horizontales (ex. classements entre joueuses) — la ligne mise en
// évidence (highlight) sert à repérer la joueuse actuellement sélectionnée
// dans un classement qui montre toute l'équipe.
export function HorizontalBarChart({ items, valueSuffix = "" }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-ink/40">Pas encore de données.</p>;
  }
  const max = niceMax(Math.max(1, ...items.map((it) => it.value)));
  const rowHeight = 26;
  const height = items.length * rowHeight + 10;
  const labelWidth = 92;
  const chartWidth = 320;
  const totalWidth = labelWidth + chartWidth + 60;

  return (
    <svg viewBox={`0 0 ${totalWidth} ${height}`} className="w-full">
      {items.map((it, i) => {
        const y = i * rowHeight + 6;
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
            />
            <text x={labelWidth + barW + 6} y={y + rowHeight / 2} dominantBaseline="middle" className="fill-ink/50 text-[10px]">
              {Number.isInteger(it.value) ? it.value : it.value.toFixed(1)}
              {valueSuffix}
              {it.sublabel ? ` (${it.sublabel})` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
