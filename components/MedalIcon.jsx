// Icône de médaille (or, argent, bronze) : ruban + disque. Sans état : utilisable côté serveur comme côté client.
const MEDALS = {
  gold: { label: "or", fill: "#F2B705", stroke: "#A67C00", ring: "#FFE27A", ribbon: "#D62839" },
  silver: { label: "argent", fill: "#C5CBD3", stroke: "#7C8693", ring: "#F4F6F8", ribbon: "#2A6FDB" },
  bronze: { label: "bronze", fill: "#CD7F32", stroke: "#8A4B14", ring: "#EDB887", ribbon: "#2F9E6B" },
};

export const MEDAL_KINDS = ["gold", "silver", "bronze"];
export const medalLabel = (kind) => (MEDALS[kind] ? MEDALS[kind].label : "");

export default function MedalIcon({ kind, size = 16 }) {
  const m = MEDALS[kind];
  if (!m) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`Médaille d'${m.label}`}
      className="inline-block shrink-0 align-middle"
    >
      <title>{`Médaille d'${m.label}`}</title>
      <polygon points="5.5,1 10.5,1 13.2,10.5 9,11.5" fill={m.ribbon} />
      <polygon points="13.5,1 18.5,1 15,11.5 10.8,10.5" fill={m.ribbon} opacity="0.85" />
      <circle cx="12" cy="16" r="6.6" fill={m.fill} stroke={m.stroke} strokeWidth="1.2" />
      <circle cx="12" cy="16" r="4.2" fill="none" stroke={m.ring} strokeWidth="1.1" />
      <path d="M9.6 14.2 A3.4 3.4 0 0 1 12.8 12.9" fill="none" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}
