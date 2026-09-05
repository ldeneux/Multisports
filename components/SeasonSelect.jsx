"use client";

// Volontairement SANS useRouter/usePathname/useSearchParams : ces hooks
// nécessitent un <Suspense> autour de tout composant qui les utilise dans
// l'App Router, sinon Next.js peut faire basculer toute la route en rendu
// 100% côté client — ce qui se traduit par un lien qui met à jour l'URL et
// l'onglet actif de la nav, mais laisse l'ancien contenu affiché. Une simple
// navigation par URL construite côté serveur évite complètement ce piège.
export default function SeasonSelect({ seasons, value, basePath }) {
  function onChange(e) {
    window.location.href = `${basePath}&season=${encodeURIComponent(e.target.value)}`;
  }

  return (
    <select
      value={value}
      onChange={onChange}
      className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-navy shadow-sm"
    >
      {seasons.map((s) => (
        <option key={s} value={s}>
          Saison {s}
        </option>
      ))}
    </select>
  );
}
