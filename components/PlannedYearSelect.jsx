"use client";

// Liste déroulante d'année du calendrier prévisionnel. Comme SeasonSelect :
// volontairement SANS useRouter/useSearchParams (voir le commentaire de
// SeasonSelect) — on navigue par URL construite côté serveur. `basePath`
// se termine par "?" ou "&" et conserve les autres paramètres de la page
// (onglet, vue, nageuse…).
export default function PlannedYearSelect({ years, value, basePath }) {
  function onChange(e) {
    window.location.href = `${basePath}planyear=${encodeURIComponent(e.target.value)}`;
  }

  return (
    <select
      value={value}
      onChange={onChange}
      aria-label="Filtrer le calendrier par année"
      className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-navy shadow-sm ring-1 ring-ink/10"
    >
      <option value="all">Toutes les années</option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
