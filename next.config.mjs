/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  experimental: {
    // Next 14.2 garde en cache client ("Router Cache") le rendu des routes
    // dynamiques pendant 30s par défaut, y compris après un appel à
    // revalidatePath() depuis une Server Action — d'où l'impression que la
    // page ne se met pas à jour après une synchro/ajout/suppression tant
    // qu'on ne force pas un rechargement complet. staleTimes.dynamic = 0
    // désactive ce cache pour les segments dynamiques et fait confiance à
    // revalidatePath pour décider quand redemander les données au serveur.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
