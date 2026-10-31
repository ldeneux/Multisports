// Reconnaît un lien YouTube ou Google Drive et en tire l'identifiant de la vidéo.
// Retourne { provider, ref } ou null si le lien n'est pas une adresse https valide.
export function parseVideoLink(raw) {
  let url;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");

  // YouTube : watch?v=ID, youtu.be/ID, /live/ID, /shorts/ID, /embed/ID
  if (host === "youtu.be") {
    const ref = url.pathname.split("/").filter(Boolean)[0];
    if (/^[\w-]{11}$/.test(ref ?? "")) return { provider: "youtube", ref };
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const fromQuery = url.searchParams.get("v");
    if (/^[\w-]{11}$/.test(fromQuery ?? "")) return { provider: "youtube", ref: fromQuery };
    const m = url.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{11})/);
    if (m) return { provider: "youtube", ref: m[1] };
  }

  // Google Drive : /file/d/ID/view, open?id=ID, uc?id=ID
  if (host === "drive.google.com") {
    const m = url.pathname.match(/^\/file\/d\/([\w-]+)/);
    if (m) return { provider: "drive", ref: m[1] };
    const id = url.searchParams.get("id");
    if (id && /^[\w-]+$/.test(id)) return { provider: "drive", ref: id };
  }

  // Autre lien https (OneDrive, Google Photos…) : on le garde comme simple lien.
  return { provider: "autre", ref: null };
}

export function embedUrl(provider, ref) {
  if (provider === "youtube" && ref) return `https://www.youtube-nocookie.com/embed/${ref}`;
  if (provider === "drive" && ref) return `https://drive.google.com/file/d/${ref}/preview`;
  return null;
}
