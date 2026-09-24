"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CircleDot, Waves, Trophy, FolderOpen, Settings, LogOut } from "lucide-react";

const LINKS = [
  { href: "/basket", label: "Basket", icon: CircleDot },
  { href: "/natation", label: "Natation", icon: Waves },
  { href: "/autres-sports", label: "Autres sports", icon: Trophy },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/parametres", label: "Paramètres", icon: Settings },
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
    <>
      {/* Sidebar (desktop) */}
      <aside className="w-56 shrink-0 bg-white border-r border-ink/10 min-h-screen p-4 hidden sm:flex flex-col">
        <Link href="/" className="mb-6 px-1 flex flex-col items-center text-center gap-2">
          <Image src="/icon-nav.png" alt="" width={80} height={80} className="rounded-2xl shrink-0" priority />
          <span className="font-display text-lg uppercase tracking-tight text-navy leading-tight">
            Sport Famille
          </span>
        </Link>

        <nav className="space-y-1 flex-1">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`w-full flex items-center gap-2 text-left text-sm font-semibold px-3 py-2 rounded-md transition ${
                  active ? "bg-navy text-white" : "text-ink/60 hover:bg-sand hover:text-ink"
                }`}
              >
                <Icon size={16} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-semibold text-ink/40 px-3 py-2 rounded-md hover:bg-sand hover:text-cardinal"
        >
          <LogOut size={16} /> Déconnexion
        </button>
      </aside>

      {/* Barre du bas (mobile) */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-ink/10 flex z-10">
        {LINKS.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 flex flex-col items-center gap-1 py-2 text-[11px] font-semibold ${
                active ? "text-navy" : "text-ink/50"
              }`}
            >
              <Icon size={18} />
              {link.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>
    </>
  );
}
