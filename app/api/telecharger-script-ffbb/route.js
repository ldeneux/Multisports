import { PUSH_FFBB_SCRIPT } from "@/lib/pushFfbbScript";

// Renvoie le script Python push_ffbb.py avec SUPABASE_URL et SUPABASE_ANON_KEY déjà
// remplis (ce sont les valeurs NEXT_PUBLIC_*, déjà publiques dans le navigateur).
// Le chemin ne commence pas par « api/ffbb » : le middleware exige donc d'être
// connecté pour le télécharger.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const body = PUSH_FFBB_SCRIPT
    .replace('SUPABASE_URL = ""', `SUPABASE_URL = ${JSON.stringify(url)}`)
    .replace('SUPABASE_ANON_KEY = ""', `SUPABASE_ANON_KEY = ${JSON.stringify(anon)}`);

  return new Response(body, {
    headers: {
      "Content-Type": "text/x-python; charset=utf-8",
      "Content-Disposition": 'attachment; filename="push_ffbb.py"',
      "Cache-Control": "no-store",
    },
  });
}
