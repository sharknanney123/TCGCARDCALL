import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { supabaseServer } from "@/lib/supabase/server";
import { getTournamentContext } from "@/lib/tournament";
import TournamentSwitcher from "@/components/TournamentSwitcher";

export const metadata: Metadata = {
  title: "TCGCardCall — Call the next card spike",
  description:
    "A free fantasy market game for Magic: The Gathering. Virtual credits only — no real money, no cash-out, no real card ownership.",
};

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/market", label: "Market" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/calls", label: "Biggest Calls" },
  { href: "/watchlist", label: "Watchlist" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  let username: string | null = null;
  let switcher: { tournaments: { id: string; name: string }[]; currentId: string | null } | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("username, role").eq("id", user.id).single();
    isAdmin = profile?.role === "admin";
    username = profile?.username ?? null;
    const ctx = await getTournamentContext(user.id);
    switcher = {
      tournaments: ctx.joined.map((t) => ({ id: t.id, name: t.name })),
      currentId: ctx.current?.id ?? null,
    };
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-edge sticky top-0 z-40 bg-ink/90 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-4">
            <Link href={user ? "/dashboard" : "/"} className="font-display text-lg text-gold whitespace-nowrap">
              TCGCardCall
            </Link>
            {user && (
              <nav className="flex gap-1 overflow-x-auto text-sm">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href}
                    className="px-3 py-1.5 rounded-lg text-faded hover:text-parchment hover:bg-panel whitespace-nowrap">
                    {n.label}
                  </Link>
                ))}
                {isAdmin && (
                  <Link href="/admin"
                    className="px-3 py-1.5 rounded-lg text-gold/80 hover:text-gold hover:bg-panel whitespace-nowrap">
                    Admin
                  </Link>
                )}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-3 text-sm">
              {user && switcher && (
                <TournamentSwitcher tournaments={switcher.tournaments} currentId={switcher.currentId} />
              )}
              {user ? (
                <>
                  {username && (
                    <Link href={`/u/${username}`} className="text-faded hover:text-parchment hidden sm:block">
                      @{username}
                    </Link>
                  )}
                  <form action="/auth/signout" method="post">
                    <button className="text-faded hover:text-parchment">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="btn-ghost">Sign in</Link>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-edge mt-10">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-faded space-y-2">
            <p>
              TCGCardCall is free-to-play. All balances, positions, and trades are virtual. Users do not
              own real cards. No real money can be deposited or withdrawn. Not financial advice.
            </p>
            <p>
              Card data and imagery provided by Scryfall. TCGCardCall is unofficial Fan Content and is
              not produced by, endorsed by, or affiliated with Scryfall or Wizards of the Coast.
              Magic: The Gathering is a trademark of Wizards of the Coast LLC.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
