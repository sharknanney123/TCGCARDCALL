import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getTournamentContext } from "@/lib/tournament";
import { usd, pct, qty, gainClass } from "@/lib/format";
import PctChip from "@/components/PctChip";

export const dynamic = "force-dynamic";

export default async function PublicProfile({ params }: { params: { username: string } }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles").select("id, username").eq("username", params.username).maybeSingle();
  if (!profile) notFound();

  await supabase.rpc("log_event", { p_type: "public_profile_view", p_meta: { viewed: profile.id } });

  const ctx = await getTournamentContext(user.id);
  const season = ctx.current;
  if (!season) return <p className="text-faded py-12 text-center">No active tournament.</p>;

  const [{ data: pf }, { data: positions }, { data: calls }, { data: trophies }] = await Promise.all([
    supabase.from("portfolios").select("*").eq("user_id", profile.id).eq("season_id", season.id).maybeSingle(),
    supabase.from("positions").select("*").eq("user_id", profile.id).eq("season_id", season.id).gt("quantity", 0),
    supabase.from("v_biggest_calls").select("*").eq("season_id", season.id).eq("user_id", profile.id)
      .order("gain_pct", { ascending: false }).limit(5),
    supabase.from("season_results")
      .select("final_rank, final_percent_gain, seasons(name)")
      .eq("user_id", profile.id).not("final_rank", "is", null).lte("final_rank", 3)
      .order("final_rank", { ascending: true }).limit(6),
  ]);

  const ids = (positions ?? []).map((p) => p.card_id);
  const { data: prices } = ids.length
    ? await supabase.from("v_card_prices").select("*").in("card_id", ids)
    : { data: [] as never[] };
  const priceMap = new Map((prices ?? []).map((p) => [p.card_id, p]));

  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="font-display text-2xl">@{profile.username}</h1>
        {pf?.rank && <span className="chip text-gold border-gold/50">Rank #{pf.rank}</span>}
        {pf?.late_joiner && <span className="chip-flat">late joiner</span>}
        {(trophies ?? []).map((t, i) => {
          const sName = Array.isArray(t.seasons) ? t.seasons[0]?.name : (t.seasons as { name?: string } | null)?.name;
          return (
            <span key={i} className="chip text-gold border-gold/50" title={`Finished #${t.final_rank} in ${sName}`}>
              {Number(t.final_rank) === 1 ? "🥇" : Number(t.final_rank) === 2 ? "🥈" : "🥉"} {sName}
            </span>
          );
        })}
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-xl">
        <div className="panel p-4"><p className="text-xs text-faded uppercase">Portfolio</p>
          <p className="font-mono text-lg mt-1">{usd(pf?.total_value)}</p></div>
        <div className="panel p-4"><p className="text-xs text-faded uppercase">Gain</p>
          <p className={`font-mono text-lg mt-1 ${gainClass(pf?.percent_gain)}`}>{pct(pf?.percent_gain)}</p></div>
        <div className="panel p-4"><p className="text-xs text-faded uppercase">Trades</p>
          <p className="font-mono text-lg mt-1">{pf?.total_trades ?? 0}</p></div>
      </section>

      {(calls ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg">Best calls</h2>
          <ul className="space-y-1.5 text-sm">
            {(calls ?? []).map((c, i) => (
              <li key={i} className="flex items-center gap-2 flex-wrap">
                <Link href={`/card/${c.card_id}`} className="hover:text-gold">{c.card_name}</Link>
                <span className="font-mono text-faded">{usd(c.buy_price)} → {usd(c.exit_or_current_price)}</span>
                <PctChip value={c.gain_pct} />
                <span className="chip-flat">{c.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead><tr>
            <th className="th">Holding</th><th className="th">Qty</th><th className="th">Avg buy</th><th className="th">Price</th><th className="th">Move</th>
          </tr></thead>
          <tbody>
            {(positions ?? []).map((p) => {
              const cp = priceMap.get(p.card_id);
              return (
                <tr key={p.card_id}>
                  <td className="td"><Link href={`/card/${p.card_id}`} className="hover:text-gold">{cp?.card_name ?? "—"}</Link></td>
                  <td className="td font-mono">{qty(p.quantity)}</td>
                  <td className="td font-mono">{usd(p.average_buy_price)}</td>
                  <td className="td font-mono">{cp?.current_price ? usd(cp.current_price) : "—"}</td>
                  <td className="td"><PctChip value={cp?.pct_change} /></td>
                </tr>
              );
            })}
            {(positions ?? []).length === 0 && (
              <tr><td className="td text-faded" colSpan={5}>No open positions.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
