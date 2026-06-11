import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { usd, pct, gainClass } from "@/lib/format";

export const dynamic = "force-dynamic";

type Mover = {
  card_name: string;
  set_name: string;
  image_url: string | null;
  price: number;
  week_pct: number;
};

type Leader = { rank: number | null; username: string; percent_gain: number };

type LandingStats = {
  season: { name: string; end_date: string } | null;
  gainers: Mover[];
  losers: Mover[];
  leaders: Leader[];
  players: number;
  cards: number;
};

export default async function Landing() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const { data } = await supabase.rpc("landing_stats");
  const stats = (data ?? {
    season: null, gainers: [], losers: [], leaders: [], players: 0, cards: 0,
  }) as LandingStats;

  // Don't repeat a card in "losers" if it already appears as a gainer
  // (only possible with a very small card pool).
  const gainerNames = new Set(stats.gainers.map((g) => g.card_name));
  const losers = stats.losers.filter((l) => !gainerNames.has(l.card_name));
  const hasMarket = stats.gainers.length > 0;

  return (
    <div className="py-12 max-w-5xl mx-auto space-y-12">
      {/* ---------- Hero ---------- */}
      <div className="text-center space-y-6 max-w-2xl mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold">
          Season play · Magic: The Gathering
        </p>
        <h1 className="font-display text-4xl sm:text-5xl leading-tight">
          Call the next card spike.
        </h1>
        <p className="text-faded text-lg">
          Start every season with $10,000 in virtual credits. Take fractional positions in real Magic
          cards at real daily market prices. Climb the leaderboard on percent gain — and prove you saw
          the sleeper before it moved.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/register" className="btn-gold">Join the season</Link>
          <Link href="/login" className="btn-ghost">Sign in</Link>
        </div>
        {stats.season && (
          <p className="font-mono text-xs text-faded">
            {stats.season.name} · {stats.players} player{stats.players === 1 ? "" : "s"} ·{" "}
            {stats.cards} cards tracked · ends {stats.season.end_date}
          </p>
        )}
      </div>

      {/* ---------- Live market proof ---------- */}
      {hasMarket && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-4">
          <section className="panel p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-lg">This week&apos;s movers</h2>
              <p className="font-mono text-xs text-faded uppercase tracking-wider">Real market prices</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {stats.gainers.map((c) => (
                <div key={c.card_name} className="space-y-2">
                  {c.image_url ? (
                    <Image src={c.image_url} alt={c.card_name} width={200} height={279}
                           className="rounded-lg w-full h-auto" unoptimized />
                  ) : (
                    <div className="aspect-[63/88] rounded-lg bg-edge/40" />
                  )}
                  <div>
                    <p className="text-sm truncate" title={c.card_name}>{c.card_name}</p>
                    <p className="font-mono text-sm">
                      {usd(c.price)}{" "}
                      <span className={gainClass(c.week_pct)}>{pct(c.week_pct)}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {losers.length > 0 && (
              <ul className="mt-4 pt-3 border-t border-edge space-y-1">
                {losers.map((c) => (
                  <li key={c.card_name} className="flex justify-between text-sm">
                    <span className="truncate text-faded">{c.card_name}</span>
                    <span className="font-mono">
                      {usd(c.price)}{" "}
                      <span className={gainClass(c.week_pct)}>{pct(c.week_pct)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-faded">
              Would you have called these? <Link href="/register" className="text-gold hover:underline">Prove it next week.</Link>
            </p>
          </section>

          <section className="panel p-5">
            <h2 className="font-display text-lg mb-4">Season leaderboard</h2>
            {stats.leaders.length > 0 ? (
              <ol className="space-y-2">
                {stats.leaders.map((l, i) => (
                  <li key={l.username} className="flex items-center justify-between text-sm">
                    <span>
                      <span className="font-mono text-faded mr-2">#{l.rank ?? i + 1}</span>
                      @{l.username}
                    </span>
                    <span className={`font-mono ${gainClass(l.percent_gain)}`}>{pct(l.percent_gain)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-faded">The season just started — the board is wide open.</p>
            )}
            <p className="mt-4 text-xs text-faded">
              Ranked by percent gain. Everyone starts with the same $10,000.
            </p>
          </section>
        </div>
      )}

      {/* ---------- How it works ---------- */}
      <section className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
        <div className="panel p-4 text-center">
          <p className="font-display text-gold mb-1">1 · Scout</p>
          <p className="text-sm text-faded">Watch real daily prices across the card pool and spot the sleepers.</p>
        </div>
        <div className="panel p-4 text-center">
          <p className="font-display text-gold mb-1">2 · Call it</p>
          <p className="text-sm text-faded">Place your order today — it fills at tomorrow&apos;s market price. No reacting, only predicting.</p>
        </div>
        <div className="panel p-4 text-center">
          <p className="font-display text-gold mb-1">3 · Climb</p>
          <p className="text-sm text-faded">Percent gain is all that counts. Best calls of the season make the front page.</p>
        </div>
      </section>

      <p className="text-xs text-faded text-center">
        Free-to-play. No real money, no prizes, no cash-out, no real card ownership.
      </p>
    </div>
  );
}
