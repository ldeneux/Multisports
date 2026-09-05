"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/basket", label: "Basket" },
  { href: "/natation", label: "Natation" },
  { href: "/autres-sports", label: "Autres sports" },
  { href: "/documents", label: "Documents" },
  { href: "/parametres", label: "Paramètres" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-ink/10 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-cardinal" aria-hidden />
            <span className="font-display text-lg uppercase tracking-tight text-navy">
              Sport Famille
            </span>
          </Link>

          <button
            onClick={handleLogout}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink/40 hover:text-cardinal"
          >
            Déconnexion
          </button>
        </div>

        <nav className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-navy text-white"
                    : "text-ink/60 hover:bg-sand hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
