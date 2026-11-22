// Format d'une vidéo de replay : Extrait, Résumé ou Complet. Pastille rose (mêmes icônes que les pictogrammes
// fournis) : pellicule + ciseaux, document, pellicule. Sans état : utilisable côté serveur comme côté client.
export const FORMAT_OPTIONS = [
  { value: "", label: "— Aucun —" },
  { value: "extrait", label: "Extrait" },
  { value: "resume", label: "Résumé" },
  { value: "complet", label: "Complet" },
];

const LABELS = { extrait: "Extrait", resume: "Résumé", complet: "Vidéo complète" };
export const FORMAT_VALUES = ["extrait", "resume", "complet"];
export const formatLabel = (format) => LABELS[format] ?? "";

const PINK = "#F20A8B";

// Pellicule (cadre blanc, perforations, écran rose, bouton lecture). dy décale la pellicule vers le haut pour « Extrait ».
function Film({ dy = 0 }) {
  const holes = [33, 42, 51, 60];
  return (
    <g transform={`translate(0 ${dy})`}>
      <rect x="17" y="29" width="66" height="42" rx="7" fill="#fff" />
      <rect x="30" y="33.5" width="40" height="33" rx="1.5" fill={PINK} />
      {holes.map((y) => (
        <g key={y}>
          <rect x="20.5" y={y} width="6.5" height="5.5" rx="1.2" fill={PINK} />
          <rect x="73" y={y} width="6.5" height="5.5" rx="1.2" fill={PINK} />
        </g>
      ))}
      <polygon points="44,41 44,59 59,50" fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
}

export default function FormatIcon({ format, size = 28 }) {
  const label = LABELS[format];
  if (!label) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label}
      className="inline-block shrink-0 align-middle"
    >
      <title>{label}</title>
      <circle cx="50" cy="50" r="50" fill={PINK} />

      {format === "complet" && <Film />}

      {format === "extrait" && (
        <>
          <Film dy={-6} />
          {/* ciseaux : halo rose pour les détacher de la pellicule, puis lames et anneaux blancs */}
          <g stroke={PINK} strokeWidth="9" strokeLinecap="round" fill={PINK}>
            <line x1="63" y1="52" x2="79" y2="77" />
            <line x1="80" y1="52" x2="63" y2="77" />
            <circle cx="62" cy="79" r="7" />
            <circle cx="80" cy="79" r="7" />
          </g>
          <g stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none">
            <line x1="63" y1="52" x2="79" y2="77" />
            <line x1="80" y1="52" x2="63" y2="77" />
            <circle cx="62" cy="79" r="4.6" />
            <circle cx="80" cy="79" r="4.6" />
          </g>
        </>
      )}

      {format === "resume" && (
        <>
          <rect x="27" y="20" width="40" height="52" rx="6" fill="#fff" />
          <polygon points="55,20 67,20 67,32" fill={PINK} />
          <polygon points="56,22 56,31 65,31" fill="#fff" stroke={PINK} strokeWidth="1.3" strokeLinejoin="round" />
          <g stroke={PINK} strokeWidth="3.2" strokeLinecap="round">
            <line x1="34" y1="34" x2="49" y2="34" />
            <line x1="34" y1="43" x2="60" y2="43" />
            <line x1="34" y1="52" x2="55" y2="52" />
            <line x1="34" y1="61" x2="46" y2="61" />
          </g>
          <circle cx="65" cy="67" r="14" fill={PINK} />
          <circle cx="65" cy="67" r="11" fill="#fff" />
          <g stroke={PINK} strokeWidth="2.4" strokeLinecap="round">
            <line x1="59" y1="62" x2="71" y2="62" />
            <line x1="58" y1="67" x2="72" y2="67" />
            <line x1="61" y1="72" x2="69" y2="72" />
          </g>
        </>
      )}
    </svg>
  );
}
