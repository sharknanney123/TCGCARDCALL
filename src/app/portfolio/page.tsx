import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getTournamentContext } from "@/lib/tournament";
import { usd, pct, qty, gainClass } from "@/lib/format";
import PctChip from "@/components/PctChip";
import PendingOrders from "@/components/PendingOrders";

export const dynamic = "force-dynamic";

export default async function Portfolio() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const ctx = await getTournamentContext(user.id);
  const season = ctx.current;
  if (!season) return <p className="text-faded py-12 text-center">No active tournament.</p>;
  if (!ctx.joined.some((t) => t.id === season.id)) {
    return (
      <p className="text-faded py-12 text-center">
        You haven&apos;t joined {season.name} yet —{" "}
        <Link href="/tournaments" className="text-gold hover:underline">join it here</Link>.
      </p>
    );
  }

  const [{ data: pf }, { data: positions }, { data: trades }, { data: pendingRaw }] = await Promise.all([
    supabase.from("portfolios").select("*").eq("user_id", user.id).eq("season_id", season.id).maybeSingle(),
    supabase.from("positions").select("*").eq("user_id", user.id).eq("season_id", season.id).gt("quantity", 0),
    supabase.from("trades").select("fee, realized_gain, side").eq("user_id", user.id).eq("season_id", season.id),
    supabase.from("pending_orders")
      .select("id, side, credit_amount, quantity, placed_at, cards(card_name)")
      .eq("user_id", user.id).eq("season_id", season.id).eq("status", "pending")
      .order("placed_at", { ascending: false }),
  ]);

  const pendingOrders = (pendingRaw ?? []).map((o) => ({
    id: Number(o.id),
    side: String(o.side),
    credit_amount: o.credit_amount === null ? null : Number(o.credit_amount),
    quantity: o.quantity === null ? null : Number(o.quantity),
    placed_at: String(o.placed_at),
    card_name:
      (Array.isArray(o.cards) ? o.cards[0]?.card_name : (o.cards as { card_name?: string } | null)?.card_name) ?? "—",
  }));

  const cardIds = (positions ?? []).map((p) => p.card_id);
  const { data: prices } = cardIds.length
    ? await supabase.from("v_card_prices").select("*").in("card_id", cardIds)
    : { data: [] as never[] };
  const priceMap = new Map((prices ?? []).map((p) => [p.card_id, p]));

  const fees = (trades ?? []).reduce((s, t) => s + Number(t.fee), 0);
  const realized = (trades ?? []).filter((t) => t.side === "sell")
    .reduce((s, t) => s + Number(t.realized_gain ?? 0), 0);
  const reservedCash = Number(pf?.reserved_cash ?? 0);

  const rows = (positions ?? []).map((p) => {
    const cp = priceMap.get(p.card_id);
    const cur = Number(cp?.current_price ?? 0);
    const value = cur * Number(p.quantity);
    const unreal = value - Number(p.cost_basis);
    return { ...p, card: cp, cur, value, unreal };
  }).sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Portfolio — {season.name}</h1>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="panel p-4"><p className="text-xs text-faded uppercase">Total value</p>
          <p className="font-mono text-lg mt-1">{usd(pf?.total_value)}</p></div>
        <div className="panel p-4"><p className="text-xs text-faded uppercase">Percent gain</p>
          <p className={`font-mono text-lg mt-1 ${gainClass(pf?.percent_gain)}`}>{pct(pf?.percent_gain)}</p></div>
        <div className="panel p-4"><p className="text-xs text-faded uppercase">Virtual cash</p>
          <p className="font-mono text-lg mt-1">{usd(pf?.virtual_cash)}</p>
          {reservedCash > 0 && (
            <p className="text-xs text-faded mt-0.5">{usd(reservedCash)} reserved for pending orders</p>
          )}</div>
        <div className="panel p-4"><p className="text-xs text-faded uppercase">Realized gain</p>
          <p className={`font-mono text-lg mt-1 ${gainClass(realized)}`}>{usd(realized)}</p></div>
        <div className="panel p-4"><p className="text-xs text-faded uppercase">Fees paid</p>
          <p className="font-mono text-lg mt-1">{usd(fees)}</p></div>
      </section>

      <PendingOrders orders={pendingOrders} />

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr>
            <th className="th">Card</th><th className="th">Qty</th><th className="th">Avg buy</th>
            <th className="th">Price</th><th className="th">Value</th><th className="th">Unrealized</th><th className="th">Move</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.card_id}>
                <td className="td"><Link href={`/card/${r.card_id}`} className="hover:text-gold">{r.card?.card_name ?? "—"}</Link></td>
                <td className="td font-mono">{qty(r.quantity)}
                  {Number(r.reserved_quantity ?? 0) > 0 && (
                    <span className="text-xs text-faded"> ({qty(r.reserved_quantity)} listed)</span>
                  )}</td>
                <td className="td font-mono">{usd(r.average_buy_price)}</td>
                <td className="td font-mono">{usd(r.cur)}</td>
                <td className="td font-mono">{usd(r.value)}</td>
                <td className={`td font-mono ${gainClass(r.unreal)}`}>{usd(r.unreal)}</td>
                <td className="td"><PctChip value={r.card?.pct_change} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="td text-faded" colSpan={7}>
                No positions yet. Head to the <Link href="/market" className="text-gold hover:underline">market</Link> and make your first call.
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
