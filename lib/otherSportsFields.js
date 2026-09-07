// Champs spécifiques à chaque sport pour le menu en cascade "Autres sports".
// Clé = slug du sport (table sports.slug). Un sport non listé ici retombe
// sur SPORT_FIELDS_FALLBACK — donc ajouter un nouveau sport dans Paramètres
// fonctionne tout de suite, juste avec des champs génériques.

export const SPORT_FIELDS = {
  plongee: [
    { key: "site", label: "Lieu", type: "text" },
    { key: "profondeur_max", label: "Profondeur max (m)", type: "number" },
    { key: "duree", label: "Durée (min)", type: "number" },
    { key: "type", label: "Type", type: "select", options: ["Exploration", "Formation", "Baptême"] },
    { key: "binome", label: "Binôme / encadrant", type: "text" },
    { key: "conditions", label: "Conditions (eau, météo)", type: "text" },
  ],
  triathlon: [
    { key: "lieu", label: "Lieu", type: "text" },
    { key: "distance_natation_m", label: "Natation (m)", type: "number" },
    { key: "distance_velo_km", label: "Vélo (km)", type: "number" },
    { key: "distance_course_km", label: "Course à pied (km)", type: "number" },
    { key: "temps_total", label: "Temps total", type: "text" },
    { key: "classement", label: "Classement", type: "text" },
  ],
  "course-a-pied": [
    { key: "lieu", label: "Lieu", type: "text" },
    { key: "distance_km", label: "Distance (km)", type: "number" },
    { key: "temps", label: "Temps", type: "text" },
    { key: "allure", label: "Allure (min/km)", type: "text" },
    { key: "classement", label: "Classement", type: "text" },
  ],
  parapente: [
    { key: "site", label: "Site de vol", type: "text" },
    { key: "duree", label: "Durée du vol (min)", type: "number" },
    { key: "altitude_max", label: "Altitude max (m)", type: "number" },
    { key: "moniteur", label: "Moniteur / accompagnateur", type: "text" },
    { key: "conditions", label: "Conditions météo", type: "text" },
  ],
};

export const SPORT_FIELDS_FALLBACK = [
  { key: "details", label: "Détails", type: "textarea" },
];

export function fieldsForSlug(slug) {
  return SPORT_FIELDS[slug] ?? SPORT_FIELDS_FALLBACK;
}
