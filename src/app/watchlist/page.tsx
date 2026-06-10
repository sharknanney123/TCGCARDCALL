import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { usd } from "@/lib/format";
import PctChip from "@/components/PctChip";
import WatchButton from "@/components/WatchButton";

export const dynamic = "force-dynamic";

export default async function Watchlist() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: watch } = await supabase
    .from("watchlist").select("card_id").eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const ids = (watch ?? []).map((w) => w.card_id);
  const { data: cards } = ids.length
    ? await supabase.from("v_card_prices").select("*").in("card_id", ids)
    : { data: [] as never[] };

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Watchlist</h1>
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead><tr>
            <th className="th">Card</th><th className="th">Price</th><th className="th">Move</th><th className="th"></th><th className="th"></th>
          </tr></thead>
          <tbody>
            {(cards ?? []).map((c) => (
              <tr key={c.card_id}>
                <td className="td"><Link href={`/card/${c.card_id}`} className="hover:text-gold">{c.card_name}</Link>
                  <span className="text-faded text-xs block">{c.set_name}</span></td>
                <td className="td font-mono">{c.current_price ? usd(c.current_price) : "—"}</td>
                <td className="td"><PctChip value={c.pct_change} /></td>
                <td className="td"><Link href={`/card/${c.card_id}`} className="btn-ghost text-xs px-3 py-1">Trade</Link></td>
                <td className="td"><WatchButton cardId={c.card_id} watched /></td>
              </tr>
            ))}
            {ids.length === 0 && (
              <tr><td className="td text-faded" colSpan={5}>
                Nothing watched yet. <Link href="/market" className="text-gold hover:underline">Browse the market</Link> and star your next call.
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
