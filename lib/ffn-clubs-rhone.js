// Annuaire des clubs de natation du Rhône, recopié depuis
// https://rhone.auvergnerhonealpes-natation.fr/clubs/ (comité départemental Rhône – Métropole de Lyon).
// Sert à retrouver, pour une compétition, le club qui reçoit : son logo et son adresse.
// ⚠ Ce sont les coordonnées du CLUB (souvent la piscine, pas toujours) : à vérifier avant de se déplacer.
// Les clubs d'eau libre, de water-polo ou de plongeon seuls ne sont pas repris.

const BASE = "https://rhone.auvergnerhonealpes-natation.fr/wp-content/uploads/sites/7/";

export const RHONE_SWIM_CLUBS = [
  { name: "Cercle Aquatique Lyon Métropole", city: "Lyon", address: "76 Cours Gambetta, 69007 Lyon", logo: "2025/09/1000067909-e1759057233110.png", keywords: ["cercle aquatique"] },
  { name: "Club Vaudais Natation", city: null, address: null, logo: "2025/07/Logo-Vaudais-2025.jpg", keywords: ["vaudais"] },
  { name: "Sauveteurs Givors", city: "Givors", address: "2 Place François Zacharie, 69700 Givors", logo: "2024/07/Sauveteurs-de-Givors.webp", keywords: ["givors"] },
  { name: "Triton Club Belleville", city: "Belleville", address: "Avenue de Verdun, Piscine intercommunale, 69220 Belleville", logo: "2024/07/logoTCB.gif", keywords: ["belleville", "triton"] },
  { name: "UJS La Mulatière Natation", city: "La Mulatière", address: "25 rue de Verdun, Piscine du Roule, 69350 La Mulatière", logo: "2024/07/logo-1.png", keywords: ["mulatiere"] },
  { name: "USOL Vaugneray", city: "Vaugneray", address: "5 rue de la Désertée, 69670 Vaugneray", logo: "2024/07/logo-USOL.png", keywords: ["vaugneray", "usol"] },
  { name: "Vienne Condrieu Olympique", city: "Saint-Romain-en-Gal", address: "Centre nautique Françoise Clavery-Bouysson, 380 RD 502, 69560 Saint-Romain-en-Gal", logo: "2024/07/VCO-logo-branding-white.png", keywords: ["vienne condrieu", "condrieu"] },
  { name: "Villeurbanne Natation", city: "Villeurbanne", address: "Centre Nautique Étienne Gagnaire, 59 avenue Marcel Cerdan, 69100 Villeurbanne", logo: "2024/07/logo_villeurbanne_natation.svg", keywords: ["villeurbanne"] },
  { name: "SAL Saint-Priest Natation", city: "Saint-Priest", address: "1 grande rue, 69800 Saint-Priest", logo: "2024/07/76e0a875-9a25-46ba-a5da-056dcff6ad59.webp", keywords: ["saint priest"] },
  { name: "Rillieux Natation", city: "Rillieux-la-Pape", address: "180 avenue de l'Hippodrome, Le boulodrome, 69140 Rillieux-la-Pape", logo: "2024/07/logo.png", keywords: ["rillieux"] },
  { name: "RC Bron Décines Natation", city: "Bron", address: "Place Gaillard Romanet, 69500 Bron", logo: "2024/07/logo-2.png", keywords: ["bron", "decines"] },
  { name: "Patronage Laïque d'Oullins", city: "Oullins", address: "27 rue Diderot, 69600 Oullins", logo: null, keywords: ["patronage"] },
  { name: "Natation Villefranche en Beaujolais", city: "Villefranche-sur-Saône", address: "535 avenue de Saint-Exupéry, 69400 Villefranche-sur-Saône", logo: "2024/07/Arriere-plan-640x640-1.png", keywords: ["villefranche"] },
  { name: "A.S. Grézieu la Varenne", city: "Grézieu-la-Varenne", address: "Centre d'animation, 69290 Grézieu-la-Varenne", logo: "2024/07/cropped-UNIVALON-RS_ASG-1024x635.jpg", keywords: ["grezieu"] },
  { name: "Aqua Synchro Lyon", city: "Lyon", address: "52 rue Sidoine Apollinaire, 69009 Lyon", logo: "2024/07/logo-ASL_150x114.png", keywords: ["aqua synchro"] },
  { name: "Aquatic Club Fidésien", city: "Sainte-Foy-lès-Lyon", address: "30 avenue du 11 Novembre, 69110 Sainte-Foy-lès-Lyon", logo: "2024/07/1719852980.png", keywords: ["fidesien", "sainte foy"] },
  { name: "AS Caluire Natation", city: "Caluire-et-Cuire", address: "310 avenue Élie Vignal, 69300 Caluire-et-Cuire", logo: "2024/07/AS-Caluire-Natation-Logo.png", keywords: ["caluire"] },
  { name: "CA des Pierres Dorées", city: "Anse", address: "856 route de Lucenay, 69480 Anse", logo: "2024/07/359522563_314488647593636_8319264185594949868_n.jpg", keywords: ["pierres dorees"] },
  { name: "Cascol Natation", city: "Oullins", address: "41 avenue de l'Aqueduc de Beaunant, 69600 Oullins", logo: "2024/07/64b84180d9fcd_LogoNatationRose1.png", keywords: ["cascol"] },
  { name: "Chassieu Natation", city: "Chassieu", address: "11 rue Maryse Bastié, 69680 Chassieu", logo: "2024/07/Logo-Chassieu-Natation.png", keywords: ["chassieu"] },
  { name: "CMO Vénissieux", city: "Vénissieux", address: "16 avenue Georges Lévy, 69200 Vénissieux", logo: "2024/07/logo-4.png", keywords: ["venissieux"] },
  { name: "CN du Pays Mornantais", city: "Mornant", address: "Maison des Associations, 14 rue Boiron, 69440 Mornant", logo: "2024/07/Logo-vert-1-cnpm-1024x865.png", keywords: ["mornant"] },
  { name: "CN Tarare", city: "Tarare", address: "77 boulevard Robert Michon, 69170 Tarare", logo: "2024/07/logo-3.png", keywords: ["tarare"] },
  { name: "Lyon Natation Métropole", city: "Lyon", address: "63 rue Bellecombe, 69006 Lyon", logo: "2024/07/logo.jpg", keywords: ["lyon natation"] },
  { name: "AS Mûre Natation", city: "Saint-Laurent-de-Mure", address: "7 rue A. Malraux, 69720 Saint-Laurent-de-Mure", logo: "2024/07/logo-AS-Mure-Natation.png", keywords: ["mure"] },
];

// Minuscules, sans accents ni ponctuation ; « st » / « ste » développés pour comparer « ST PRIEST » à « Saint-Priest ».
export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bstes\b/g, "saintes")
    .replace(/\bste\b/g, "sainte")
    .replace(/\bst\b/g, "saint")
    .trim();
}

const hasPhrase = (haystack, phrase) => new RegExp(`(^| )${normalizeText(phrase)}( |$)`).test(haystack);

// Retrouve le club qui reçoit : d'abord par un mot distinctif dans l'intitulé ou le lieu
// (« Meeting de Rillieux »), sinon par la ville quand un seul club y est installé.
// Renvoie null dans le doute (plusieurs clubs possibles, ou club hors du Rhône) plutôt que de se tromper.
export function findHostClub({ title, location }) {
  const text = `${normalizeText(title)} ${normalizeText(location)}`.trim();
  const loc = normalizeText(location);
  if (!text) return null;

  const toResult = (club) => ({
    name: club.name,
    address: club.address,
    logo: club.logo ? BASE + club.logo : null,
  });

  const byKeyword = RHONE_SWIM_CLUBS.filter((c) => c.keywords.some((k) => hasPhrase(text, k)));
  if (byKeyword.length === 1) return toResult(byKeyword[0]);
  if (byKeyword.length > 1) return null;

  if (loc) {
    const byCity = RHONE_SWIM_CLUBS.filter((c) => c.city && hasPhrase(loc, c.city));
    if (byCity.length === 1) return toResult(byCity[0]);
  }
  return null;
}
