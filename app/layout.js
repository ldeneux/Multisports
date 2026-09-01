import { Archivo_Black, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
});

export const metadata = {
  title: "Sport Famille",
  description: "Calendriers, résultats, statistiques et diplômes sportifs de Candice, Amandine et Julia.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sport Famille",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${archivoBlack.variable} ${sourceSans.variable}`}>
      <body className="font-body min-h-screen">{children}</body>
    </html>
  );
}
