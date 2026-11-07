"use client";

// Liste déroulante générique pilotée par l'URL (même principe que
// SeasonSelect : pas de useRouter/useSearchParams, on navigue vers une URL
// construite côté serveur). `basePath` contient déjà tous les autres
// paramètres et se termine par "&" ou "?". Une valeur vide retire le paramètre.
export default function UrlSelect({ options, value, basePath, param, emptyLabel, ariaLabel }) {
  function onChange(e) {
    const v = e.target.value;
    window.location.href = v ? `${basePath}${param}=${encodeURIComponent(v)}` : basePath.replace(/[?&]$/, "");
  }

  return (
    <select
      value={value ?? ""}
      onChange={onChange}
      aria-label={ariaLabel}
      className="max-w-full rounded-full bg-sand px-3 py-1.5 text-xs font-semibold text-navy ring-1 ring-ink/10"
    >
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
