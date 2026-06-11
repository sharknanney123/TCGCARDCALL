import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getTournamentContext } from "@/lib/tournament";
import { usd, gainClass } from "@/lib/format";
import PctChip from "@/components/PctChip";

export const dynamic = "force-dynamic";

export default async function BiggestCalls() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  await supabase.rpc("log_event", { p_type: "biggest_calls_view", p_meta: {} });

  const ctx = await getTournamentContext(user.id);
  const season = ctx.current;
  if (!season) return <p className="text-faded py-12 text-center">No active tournament.</p>;

  const { data: calls } = await supabase
    .from("v_biggest_calls").select("*").eq("season_id", season.id)
    .order("gain_pct", { ascending: false }).limit(50);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Biggest Calls — {season.name}</h1>
      <p className="text-sm text-faded">
        The best individual card calls of the season, ranked by percent gain. A call qualifies after
        $10+ cost basis and 24 hours held — sold calls count at their exit price.
      </p>

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr>
            <th className="th">#</th><th className="th">Player</th><th className="th">Card</th>
            <th className="th">Buy</th><th className="th">Now / exit</th>
            <th className="th">Gain %</th><th className="th">Gain $</th><th className="th">Status</th>
          </tr></thead>
          <tbody>
            {(calls ?? []).map((c, i) => (
              <tr key={`${c.user_id}-${c.card_id}-${c.status}-${i}`}>
                <td className="td font-mono text-gold">{i + 1}</td>
                <td className="td"><Link href={`/u/${c.username}`} className="hover:text-gold">@{c.username}</Link></td>
                <td className="td"><Link href={`/card/${c.card_id}`} className="hover:text-gold">{c.card_name}</Link></td>
                <td className="td font-mono">{usd(c.buy_price)}</td>
                <td className="td font-mono">{usd(c.exit_or_current_price)}</td>
                <td className="td"><PctChip value={c.gain_pct} /></td>
                <td className={`td font-mono ${gainClass(c.gain_usd)}`}>{usd(c.gain_usd)}</td>
                <td className="td"><span className="chip-flat">{c.status}</span></td>
              </tr>
            ))}
            {(calls ?? []).length === 0 && (
              <tr><td className="td text-faded" colSpan={8}>No qualifying calls yet — hold a position 24 hours and it shows up here.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
