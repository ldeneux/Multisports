import { formatDate } from "@/lib/utils";

// Palette réutilisée pour distinguer plusieurs séries sur la courbe (une
// couleur par épreuve). Reprend les teintes de la charte + quelques
// variantes suffisamment contrastées entre elles.
const SERIES_COLORS = [
  "#D6293F", // cardinal
  "#1E88C7", // lagoon
  "#0B2545", // navy
  "#E08E1D", // ambre
  "#4CAF7D", // vert
  "#8E44AD", // violet
  "#C2185B", // rose foncé
  "#00838F", // sarcelle
];

/**
 * Radar (toile d'araignée) des épreuves d'une nageuse : un axe par épreuve,
 * un score de 0 (dernière du champ) à 100 (meilleure du champ) — calculé en
 * amont (voir computeEventPercentile dans page.js), pas un simple rang.
 */
export function SwimRadarChart({ data, size = 340 }) {
  if (!data || data.length === 0) return null;

  const center = size / 2;
  const maxRadius = size / 2 - 64; // marge pour les libellés d'épreuve
  const rings = [20, 40, 60, 80, 100];
  const angleStep = (2 * Math.PI) / data.length;
  const angleFor = (i) => i * angleStep - Math.PI / 2;

  const pointAt = (i, value) => {
    const r = (value / 100) * maxRadius;
    const a = angleFor(i);
    return { x: center + r * Math.cos(a), y: center + r * Math.sin(a) };
  };

  const dataPoints = data.map((d, i) => pointAt(i, d.percentile));
  const dataPath =
    dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-md">
      {/* Toile de fond : anneaux + axes */}
      {rings.map((ring) => {
        const pts = data.map((_, i) => pointAt(i, ring));
        const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
        return <path key={ring} d={path} fill="none" stroke="#0B2545" strokeOpacity="0.1" strokeWidth="1" />;
      })}
      {data.map((_, i) => {
        const p = pointAt(i, 100);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="#0B2545"
            strokeOpacity="0.15"
            strokeWidth="1"
          />
        );
      })}

      {/* Score de la nageuse */}
      <path d={dataPath} fill="#D6293F" fillOpacity="0.18" stroke="#D6293F" strokeWidth="2" strokeLinejoin="round" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#D6293F" />
      ))}

      {/* Libellés d'épreuve + score, positionnés au-delà de l'anneau 100 */}
      {data.map((d, i) => {
        const a = angleFor(i);
        const labelR = maxRadius + 26;
        const x = center + labelR * Math.cos(a);
        const y = center + labelR * Math.sin(a);
        const cos = Math.cos(a);
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return (
          <g key={i}>
            <text
              x={x}
              y={y - 5}
              textAnchor={anchor}
              className="font-body"
              style={{ fontSize: "10px", fontWeight: 600, fill: "#0B2545" }}
            >
              {d.label}
            </text>
            <text
              x={x}
              y={y + 8}
              textAnchor={anchor}
              className="font-display"
              style={{ fontSize: "11px", fontWeight: 700, fill: "#D6293F" }}
            >
              {Math.round(d.percentile)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Courbe d'évolution du percentile dans le temps, une ligne par épreuve.
 * Y = percentile (0 à 100, fixe). X = date de compétition (proportionnelle
 * à l'écart réel entre les dates, pas juste l'ordre des points).
 */
export function SwimPercentileTrendChart({ series, width = 640, height = 320 }) {
  const withPoints = (series ?? []).filter((s) => s.points && s.points.length > 0);
  if (withPoints.length === 0) return null;

  const padding = { top: 16, right: 16, bottom: 36, left: 34 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const allDates = withPoints.flatMap((s) => s.points.map((p) => new Date(p.date).getTime()));
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const dateSpan = maxDate - minDate || 1;

  const xFor = (dateStr) => {
    const t = new Date(dateStr).getTime();
    return padding.left + ((t - minDate) / dateSpan) * plotW;
  };
  const yFor = (percentile) => padding.top + (1 - percentile / 100) * plotH;

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* Grille horizontale + libellés Y */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padding.left}
              y1={yFor(t)}
              x2={width - padding.right}
              y2={yFor(t)}
              stroke="#0B2545"
              strokeOpacity="0.08"
              strokeWidth="1"
            />
            <text x={padding.left - 8} y={yFor(t) + 3} textAnchor="end" style={{ fontSize: "9px", fill: "#0B2545", opacity: 0.5 }}>
              {t}
            </text>
          </g>
        ))}

        {/* Repères X : première et dernière date */}
        <text x={padding.left} y={height - 10} textAnchor="start" style={{ fontSize: "9px", fill: "#0B2545", opacity: 0.5 }}>
          {formatDate(new Date(minDate).toISOString(), { weekday: false })}
        </text>
        <text x={width - padding.right} y={height - 10} textAnchor="end" style={{ fontSize: "9px", fill: "#0B2545", opacity: 0.5 }}>
          {formatDate(new Date(maxDate).toISOString(), { weekday: false })}
        </text>

        {withPoints.map((s, si) => {
          const color = s.color ?? SERIES_COLORS[si % SERIES_COLORS.length];
          const sorted = [...s.points].sort((a, b) => new Date(a.date) - new Date(b.date));
          const path = sorted
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.date).toFixed(1)} ${yFor(p.percentile).toFixed(1)}`)
            .join(" ");
          return (
            <g key={s.label}>
              <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {sorted.map((p, i) => (
                <circle key={i} cx={xFor(p.date)} cy={yFor(p.percentile)} r="3" fill={color}>
                  <title>
                    {s.label} · {formatDate(p.date, { weekday: false })} · {Math.round(p.percentile)}e percentile
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {withPoints.map((s, si) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs font-semibold text-ink/60">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color ?? SERIES_COLORS[si % SERIES_COLORS.length] }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
