import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getTournamentContext } from "@/lib/tournament";
import TournamentJoin from "@/components/TournamentJoin";
import { usd, pct, qty, gainClass } from "@/lib/format";
import PctChip from "@/components/PctChip";

export const dynamic = "force-dynamic";

type SettledOrder = {
  id: number;
  side: string;
  status: string;
  credit_amount: number | null;
  fill_price: number | null;
  fill_quantity: number | null;
  reject_reason: string | null;
  settled_at: string;
  card_name: string;
};

export default async function Dashboard() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  await supabase.rpc("log_event", { p_type: "login", p_meta: {} });

  const ctx = await getTournamentContext(user.id);
  const season = ctx.current;

  if (!season) {
    return (
      <div className="py-16 text-center space-y-3">
        <h1 className="font-display text-2xl">No tournament is live right now</h1>
        <p className="text-faded">The next one will appear here when it starts.</p>
      </div>
    );
  }
  const joined = ctx.joined.some((t) => t.id === season.id);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: pf },
    { data: gainers },
    { data: losers },
    { data: call },
    { data: watch },
    { data: settledRaw },
    { count: pendingCount },
  ] = await Promise.all([
    supabase.from("portfolios").select("*").eq("user_id", user.id).eq("season_id", season.id).maybeSingle(),
    supabase.from("v_card_prices").select("*").eq("active", true)
      .not("pct_change", "is", null).order("pct_change", { ascending: false }).limit(3),
    supabase.from("v_card_prices").select("*").eq("active", true)
      .not("pct_change", "is", null).order("pct_change", { ascending: true }).limit(3),
    supabase.from("v_biggest_calls").select("*").eq("season_id", season.id)
      .order("gain_pct", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("watchlist").select("card_id").eq("user_id", user.id).limit(4),
    supabase.from("pending_orders")
      .select("id, side, status, credit_amount, fill_price, fill_quantity, reject_reason, settled_at, cards(card_name)")
      .eq("user_id", user.id).eq("season_id", season.id)
      .in("status", ["filled", "rejected"])
      .gte("settled_at", since)
      .order("settled_at", { ascending: false }),
    supabase.from("pending_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("season_id", season.id).eq("status", "pending"),
  ]);

  const settled: SettledOrder[] = (settledRaw ?? []).map((o) => ({
    id: Number(o.id),
    side: String(o.side),
    status: String(o.status),
    credit_amount: o.credit_amount === null ? null : Number(o.credit_amount),
    fill_price: o.fill_price === null ? null : Number(o.fill_price),
    fill_quantity: o.fill_quantity === null ? null : Number(o.fill_quantity),
    reject_reason: o.reject_reason === null ? null : String(o.reject_reason),
    settled_at: String(o.settled_at),
    card_name:
      (Array.isArray(o.cards) ? o.cards[0]?.card_name : (o.cards as { card_name?: string } | null)?.card_name) ?? "—",
  }));

  const watchIds = (watch ?? []).map((w) => w.card_id);
  const { data: watchCards } = watchIds.length
    ? await supabase.from("v_card_prices").select("*").in("card_id", watchIds)
    : { data: [] as never[] };

  const topUp = gainers ?? [];
  const topDown = losers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display text-2xl">{season.name}</h1>
        <p className="text-sm text-faded">
          Ends {season.end_date} · <Link href="/tournaments" className="text-gold hover:underline">All tournaments</Link>
        </p>
      </div>

      {!joined && (
        <section className="panel p-4 border-gold/40 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm">You haven&apos;t joined <span className="text-gold">{season.name}</span> yet — join to start trading.</p>
          <TournamentJoin seasonId={season.id} joined={false} viewing={false} />
        </section>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="panel p-4">
          <p className="text-xs text-faded uppercase tracking-wider">Portfolio value</p>
          <p className="font-mono text-xl mt-1">{usd(pf?.total_value)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-faded uppercase tracking-wider">Percent gain</p>
          <p className={`font-mono text-xl mt-1 ${gainClass(pf?.percent_gain)}`}>{pct(pf?.percent_gain)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-faded uppercase tracking-wider">Virtual cash</p>
          <p className="font-mono text-xl mt-1">{usd(pf?.virtual_cash)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-faded uppercase tracking-wider">Season rank</p>
          <p className="font-mono text-xl mt-1">
            {pf?.rank ? `#${pf.rank}` : <span className="text-faded text-sm">Trade 3+ cards to rank</span>}
          </p>
        </div>
      </section>

      {(settled.length > 0 || (pendingCount ?? 0) > 0) && (
        <section className="panel p-4 border-jade/30">
          <p className="text-xs text-jade uppercase tracking-[0.25em] mb-2">Since yesterday</p>
          <ul className="space-y-1.5 text-sm">
            {settled.map((o) =>
              o.status === "filled" ? (
                <li key={o.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`font-mono uppercase text-xs ${o.side === "buy" ? "text-jade" : "text-ember"}`}>
                    {o.side === "buy" ? "Filled buy" : "Filled sell"}
                  </span>
                  <span>
                    {qty(o.fill_quantity)} × <span className="font-medium">{o.card_name}</span> @{" "}
                    <span className="font-mono">{usd(o.fill_price)}</span>
                    {" "}= <span className="font-mono">{usd((o.fill_quantity ?? 0) * (o.fill_price ?? 0))}</span>
                  </span>
                </li>
              ) : (
                <li key={o.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono uppercase text-xs text-ember">Rejected</span>
                  <span>
                    {o.side} on <span className="font-medium">{o.card_name}</span>
                    {o.reject_reason ? <span className="text-faded"> — {o.reject_reason}</span> : null}
                  </span>
                </li>
              )
            )}
            {(pendingCount ?? 0) > 0 && (
              <li className="text-faded pt-1">
                {pendingCount} order{(pendingCount ?? 0) > 1 ? "s" : ""} pending — fills at the next daily price update.{" "}
                <Link href="/portfolio" className="text-gold hover:underline">Review</Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {call && (
        <section className="panel p-4 border-gold/40 bg-gradient-to-r from-gold/10 to-transparent">
          <p className="text-xs text-gold uppercase tracking-[0.25em] mb-1">Biggest call of the season</p>
          <p className="text-sm">
            <Link href={`/u/${call.username}`} className="text-gold hover:underline">@{call.username}</Link>
            {" "}called <Link href={`/card/${call.card_id}`} className="hover:underline font-medium">{call.card_name}</Link>
            {" "}at <span className="font-mono">{usd(call.buy_price)}</span> →{" "}
            <span className="font-mono">{usd(call.exit_or_current_price)}</span>{" "}
            <PctChip value={call.gain_pct} />
          </p>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <section className="panel p-4">
          <h2 className="font-display mb-3">Top movers today</h2>
          <ul className="space-y-2">
            {[...topUp, ...topDown].map((c) => (
              <li key={c.card_id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/card/${c.card_id}`} className="truncate hover:text-gold">{c.card_name}</Link>
                <span className="flex items-center gap-2 font-mono">
                  {usd(c.current_price)} <PctChip value={c.pct_change} />
                </span>
              </li>
            ))}
            {topUp.length === 0 && <li className="text-sm text-faded">Movers appear after the first two daily price updates.</li>}
          </ul>
        </section>

        <section className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display">Your watchlist</h2>
            <Link href="/watchlist" className="text-xs text-gold hover:underline">View all</Link>
          </div>
          <ul className="space-y-2">
            {(watchCards ?? []).map((c) => (
              <li key={c.card_id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/card/${c.card_id}`} className="truncate hover:text-gold">{c.card_name}</Link>
                <span className="flex items-center gap-2 font-mono">
                  {usd(c.current_price)} <PctChip value={c.pct_change} />
                </span>
              </li>
            ))}
            {watchIds.length === 0 && (
              <li className="text-sm text-faded">
                Nothing watched yet. <Link href="/market" className="text-gold hover:underline">Browse the market</Link> and star the cards you think will move.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
